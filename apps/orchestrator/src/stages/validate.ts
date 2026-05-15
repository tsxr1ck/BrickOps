import type { PipelineContext } from '../pipeline';
import { prisma } from '@brickops/db';
import { CommandRunner } from '@brickops/execution';

export interface ValidationResult {
  pass: boolean;
  summary: string;
  issues: string[];
  compilerErrors?: string;
}

/**
 * Validation stage (Compiler-as-Critic).
 *
 * Runs actual compiler checks against generated code:
 * 1. tsc --noEmit (TypeScript type checking)
 * 2. Mechanical checks (package.json, entry point, tsconfig)
 *
 * Returns structured errors so the pipeline can feed them
 * back to the coding agent for auto-fix retries.
 */
export async function runValidation(ctx: PipelineContext): Promise<ValidationResult> {
  console.log(`[validate] Running validation for project ${ctx.projectId}`);

  if (!ctx.workspacePath) {
    throw new Error('No workspace path for validation');
  }

  const fs = await import('fs/promises');
  const path = await import('path');
  const issues: string[] = [];
  let compilerErrors: string | undefined;

  // --- Compiler check: tsc --noEmit ---
  const tsconfigPath = path.join(ctx.workspacePath, 'tsconfig.json');
  try {
    await fs.stat(tsconfigPath);

    const runner = new CommandRunner(ctx.workspacePath);
    try {
      const { stdout, stderr } = await runner.run('tsc --noEmit');
      if (stderr.trim()) {
        compilerErrors = stderr;
        issues.push('TypeScript compilation failed');
      }
      if (stdout.trim()) {
        compilerErrors = (compilerErrors || '') + '\n' + stdout;
      }
      if (!stderr.trim() && !stdout.trim()) {
        console.log('[validate] TypeScript compilation passed');
      }
    } catch (err: any) {
      compilerErrors = err.message;
      issues.push('TypeScript compilation failed');
    }
  } catch {
    issues.push('tsconfig.json not found — skipping type checking');
  }

  // --- Mechanical checks ---

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

  const pass = compilerErrors ? false : issues.length === 0;
  const summary = pass
    ? 'All checks passed'
    : `${issues.length} issue(s) found`;

  const result: ValidationResult = { pass, summary, issues, compilerErrors };

  // Store validation result
  await prisma.projectThread.create({
    data: {
      projectId: ctx.projectId,
      role: 'system',
      content: JSON.stringify({ stage: 'validation', ...result }),
    },
  });

  if (!pass) {
    console.warn(`[validate] Validation failed: ${result.issues.join(', ')}`);
    if (compilerErrors) {
      console.warn(`[validate] Compiler errors:\n${compilerErrors.slice(0, 500)}`);
    }
  }

  console.log(`[validate] Validation ${pass ? 'passed' : 'failed'}`);
  return result;
}
