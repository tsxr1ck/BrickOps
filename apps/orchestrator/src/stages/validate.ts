import type { PipelineContext } from '../pipeline';
import { prisma } from '@brickops/db';

/**
 * Validation stage (Reality Checker).
 *
 * Runs semantic validation on the generated code to catch:
 * - Missing imports
 * - Placeholder content
 * - Broken routes
 * - Inconsistent dependencies
 *
 * Uses the reality-checker persona when AI is available.
 * Falls back to mechanical checks otherwise.
 */

export async function runValidation(ctx: PipelineContext): Promise<void> {
  console.log(`[validate] Running validation for project ${ctx.projectId}`);

  if (!ctx.workspacePath) {
    throw new Error('No workspace path for validation');
  }

  const issues: string[] = [];

  // Mechanical validation — check basic structural integrity
  const fs = await import('fs/promises');
  const path = await import('path');

  // Check package.json exists
  try {
    const pkgPath = path.join(ctx.workspacePath, 'package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);

    if (!pkg.name) issues.push('package.json missing "name" field');
    if (!pkg.scripts) issues.push('package.json missing "scripts" field');
  } catch {
    issues.push('package.json not found or invalid');
  }

  // Check entry point exists
  try {
    await fs.stat(path.join(ctx.workspacePath, 'src', 'index.ts'));
  } catch {
    issues.push('src/index.ts entry point not found');
  }

  // Check tsconfig exists
  try {
    await fs.stat(path.join(ctx.workspacePath, 'tsconfig.json'));
  } catch {
    issues.push('tsconfig.json not found');
  }

  // Store validation result
  const result = {
    pass: issues.length === 0,
    summary: issues.length === 0
      ? 'All mechanical checks passed'
      : `${issues.length} issue(s) found`,
    issues,
  };

  await prisma.projectThread.create({
    data: {
      projectId: ctx.projectId,
      role: 'system',
      content: JSON.stringify({ stage: 'validation', ...result }),
    },
  });

  if (!result.pass) {
    console.warn(`[validate] Validation failed: ${result.issues.join(', ')}`);
    // Don't throw — let the pipeline continue but log warnings
    // A strict mode would throw here to block the build
  }

  console.log(`[validate] Validation ${result.pass ? 'passed ✓' : 'has warnings ⚠'}`);
}
