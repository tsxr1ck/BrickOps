import type { PipelineContext } from '../pipeline';
import { CommandRunner } from '@brickops/execution';
import { prisma } from '@brickops/db';

/**
 * Build stage.
 *
 * Runs install + build commands in the workspace.
 * Captures stdout/stderr for debugging.
 */

export async function runBuild(ctx: PipelineContext): Promise<void> {
  console.log(`[build] Running build for project ${ctx.projectId}`);

  if (!ctx.workspacePath) {
    throw new Error('No workspace path for build');
  }

  const runner = new CommandRunner(ctx.workspacePath);
  const outputs: { command: string; stdout: string; stderr: string }[] = [];

  // Step 1: Install dependencies
  try {
    console.log('[build] Running bun install...');
    const installResult = await runner.run('bun install');
    outputs.push({ command: 'bun install', ...installResult });
    console.log('[build] Install complete ✓');
  } catch (err: any) {
    console.error('[build] Install failed:', err.message);
    outputs.push({ command: 'bun install', stdout: '', stderr: err.message });

    // Store build output before throwing
    await storeBuildOutput(ctx.projectId, outputs, 'failed');
    throw new Error(`Install failed: ${err.message}`);
  }

  // Step 2: Build (if a build script exists)
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const pkgContent = await fs.readFile(
      path.join(ctx.workspacePath, 'package.json'),
      'utf-8'
    );
    const pkg = JSON.parse(pkgContent);

    if (pkg.scripts?.build) {
      console.log('[build] Running bun run build...');
      const buildResult = await runner.run('bun run build');
      outputs.push({ command: 'bun run build', ...buildResult });
      console.log('[build] Build complete ✓');
    } else {
      console.log('[build] No build script found — skipping');
    }
  } catch (err: any) {
    console.error('[build] Build failed:', err.message);
    outputs.push({ command: 'bun run build', stdout: '', stderr: err.message });
    await storeBuildOutput(ctx.projectId, outputs, 'failed');
    throw new Error(`Build failed: ${err.message}`);
  }

  await storeBuildOutput(ctx.projectId, outputs, 'passed');
  console.log('[build] All build steps complete ✓');
}

async function storeBuildOutput(
  projectId: string,
  outputs: { command: string; stdout: string; stderr: string }[],
  result: 'passed' | 'failed'
): Promise<void> {
  await prisma.projectThread.create({
    data: {
      projectId,
      role: 'system',
      content: JSON.stringify({
        stage: 'build',
        result,
        steps: outputs.map((o) => ({
          command: o.command,
          stdout: o.stdout.slice(0, 2000),
          stderr: o.stderr.slice(0, 2000),
        })),
      }),
    },
  });
}
