import type { PipelineContext } from '../pipeline';
import { prisma } from '@brickops/db';
import { FileSystemSandbox } from '@brickops/execution';
import type { Action } from '@brickops/contracts';
import { executor } from '../executor';
import fs from 'fs/promises';
import path from 'path';

/**
 * Coding stage — handles both initial scaffold and re-entrant edits.
 */

export async function runCoding(ctx: PipelineContext): Promise<void> {
  console.log(`[coding] Generating code for project ${ctx.projectId}`);

  if (!ctx.workspacePath) {
    throw new Error('No workspace path — provisioning must run first');
  }

  const threads = await prisma.projectThread.findMany({
    where: { projectId: ctx.projectId },
    orderBy: { createdAt: 'asc' },
  });

  const description = threads.find((t) => t.role === 'user')?.content || '';
  const plan = threads.find((t) => t.role === 'assistant')?.content || '';
  const classificationThread = threads.find((t) => t.role === 'system' && t.content.includes('"type"'));
  let classification: { type: string; roles: string[] } = { type: 'fullstack', roles: [] };
  if (classificationThread?.content) {
    try { classification = JSON.parse(classificationThread.content); } catch {}
  }

  const existingFiles = await listWorkspaceFiles(ctx.workspacePath);
  const isEdit = existingFiles.length > 2;

  let actions: Action[];

  if (isEdit) {
    console.log(`[coding] Edit mode — ${existingFiles.length} existing files`);
    const editRequest = getLatestEditRequest(threads);
    actions = await generateEditActions(description, editRequest, existingFiles, ctx.workspacePath);
  } else {
    console.log(`[coding] Scaffold mode — generating new files`);
    actions = await generateScaffoldActions(description, plan, classification);
  }

  const sandbox = new FileSystemSandbox(ctx.workspacePath);
  let executed = 0;

  for (const action of actions) {
    try {
      switch (action.action) {
        case 'create_file':
          await sandbox.createFile(action.path, action.content);
          console.log(`[coding] Created: ${action.path}`);
          break;
        case 'patch_file':
          await sandbox.patchFile(action.path, action.search, action.replace);
          console.log(`[coding] Patched: ${action.path}`);
          break;
        case 'delete_file':
          await sandbox.deleteFile(action.path);
          console.log(`[coding] Deleted: ${action.path}`);
          break;
      }
      executed++;
    } catch (err: any) {
      console.warn(`[coding] Action failed for ${(action as any).path}: ${err.message}`);
    }
  }

  await prisma.projectThread.create({
    data: {
      projectId: ctx.projectId,
      role: 'system',
      content: JSON.stringify({
        stage: 'coding',
        mode: isEdit ? 'edit' : 'scaffold',
        totalActions: actions.length,
        executed,
        files: actions
          .filter((a): a is Extract<Action, { action: 'create_file' }> => a.action === 'create_file')
          .map((a) => a.path),
      }),
    },
  });

  console.log(`[coding] Executed ${executed}/${actions.length} actions`);
}

async function listWorkspaceFiles(workspacePath: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else files.push(path.relative(workspacePath, full));
      }
    } catch {}
  }
  await walk(workspacePath);
  return files;
}

function getLatestEditRequest(threads: any[]): string {
  const userThreads = threads.filter((t) => t.role === 'user');
  return userThreads[userThreads.length - 1]?.content || 'Update the project';
}

async function generateEditActions(
  description: string,
  editRequest: string,
  existingFiles: string[],
  workspacePath: string,
): Promise<Action[]> {
  // Read key existing files for context
  const fileContents: string[] = [];
  for (const file of existingFiles.slice(0, 8)) {
    try {
      const content = await fs.readFile(path.join(workspacePath, file), 'utf-8');
      fileContents.push(`--- ${file} ---\n${content.slice(0, 2000)}`);
    } catch {}
  }

  try {
    const response = await executor.execute({
      role: 'minimal-change-engineer',
      taskType: 'code-edit',
      taskPrompt: `Edit this existing project based on the request.

Project: ${description.slice(0, 300)}

Edit request: ${editRequest}

Existing files:
${existingFiles.join('\n')}

File contents (excerpts):
${fileContents.join('\n\n')}

Generate patching actions. Prefer patch_file (surgical edits) over create_file (full rewrite).
Only include files that need changes. Use exact text matches for search strings.

Respond with JSON array:
[{"action":"patch_file","path":"src/file.ts","search":"exact old text","replace":"new text"}, ...]`,
      actionSchema: `[ { "action": "patch_file", "path": "string", "search": "string", "replace": "string" } ]`,
      maxTokens: 4096,
    });

    return response.parsedJson || [];
  } catch (err: any) {
    console.warn('[coding] Edit generation failed:', err.message);
    return [];
  }
}

async function generateScaffoldActions(
  description: string,
  plan: string,
  classification: { type: string; roles: string[] },
): Promise<Action[]> {
  try {
    const response = await executor.execute({
      role: 'scaffold-agent',
      taskType: 'code-scaffold',
      taskPrompt: `Generate the complete file scaffold for this project based on the implementation plan.

Project Type: ${classification.type}
Description: ${description}

Implementation Plan:
${plan}

Generate ALL files needed for a working project. Include:
- package.json with correct dependencies
- tsconfig.json
- src/index.ts (entry point)
- All source files mentioned in the plan
- .gitignore
- README.md

Respond with JSON array: [{"action":"create_file","path":"rel/path","content":"full content"}, ...]
Every file must have COMPLETE content. No placeholders. Use real working code.`,
      actionSchema: `[ { "action": "create_file", "path": "string", "content": "string" } ]`,
      maxTokens: 8192,
    });

    return response.parsedJson || getFallbackScaffold(description, classification.type);
  } catch {
    return getFallbackScaffold(description, classification.type);
  }
}

function getFallbackScaffold(description: string, projectType: string): Action[] {
  const actions: Action[] = [];

  const pkg: Record<string, any> = {
    name: 'brickops-project', version: '0.1.0', private: true, type: 'module',
    scripts: { dev: 'bun run src/index.ts', build: 'bun build ./src/index.ts --outfile=dist/index.js' },
    dependencies: {}, devDependencies: { typescript: '^5.0.0', '@types/bun': 'latest' },
  };

  if (projectType === 'frontend-spa') {
    pkg.dependencies = { react: '^19.0.0', 'react-dom': '^19.0.0', 'react-router': '^7.0.0' };
    pkg.devDependencies = { ...pkg.devDependencies, vite: '^6.0.0', '@vitejs/plugin-react': '^4.0.0' };
    pkg.scripts = { dev: 'vite', build: 'vite build' };
  }

  actions.push({ action: 'create_file', path: 'package.json', content: JSON.stringify(pkg, null, 2) });
  actions.push({ action: 'create_file', path: 'tsconfig.json', content: JSON.stringify({ compilerOptions: { target: 'ESNext', module: 'ESNext', moduleResolution: 'bundler', strict: true, esModuleInterop: true, skipLibCheck: true, outDir: './dist', rootDir: './src' }, include: ['src'] }, null, 2) });
  actions.push({ action: 'create_file', path: '.gitignore', content: 'node_modules/\ndist/\n.env\n.env.local\n*.log\n' });
  actions.push({ action: 'create_file', path: 'src/index.ts', content: `// ${description}\nconsole.log('Project ready');` });
  actions.push({ action: 'create_file', path: 'README.md', content: `# Project\n${description}\n\n\`\`\`bash\nbun install\nbun run dev\n\`\`\`\n` });

  return actions;
}
