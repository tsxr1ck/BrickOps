import type { PipelineContext } from '../pipeline';
import { prisma } from '@brickops/db';
import { FileSystemSandbox } from '@brickops/execution';
import { executor } from '../executor';
import fs from 'fs/promises';
import path from 'path';

const SCREENSHOT_DEPS = [
  'puppeteer',
  'pixelmatch',
  'pngjs',
];

const DEFAULT_TS_CONFIG = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    resolveJsonModule: true,
    isolatedModules: true,
    noEmit: true,
    jsx: 'react-jsx',
    outDir: './dist',
  },
  include: ['src'],
};

const MIN_SCRIPTS = {
  build: 'tsc && vite build',
  dev: 'vite',
  preview: 'vite preview',
};

const MIN_PKG = {
  name: 'brickops-app',
  version: '0.0.1',
  type: 'module',
  private: true,
};

/**
 * Scaffold stage — ensures the workspace has baseline project files
 * (package.json, tsconfig.json, entry point, etc.) before coding begins.
 *
 * Detects existing files, classifies the project type from intake,
 * and generates appropriate scaffold content using the architect LLM.
 */
export async function runScaffold(ctx: PipelineContext): Promise<void> {
  console.log(`[scaffold] Checking workspace for ${ctx.projectId}`);

  if (!ctx.workspacePath) {
    throw new Error('No workspace path — provisioning must run first');
  }

  const existingFiles = await listAllFiles(ctx.workspacePath);
  const hasPkg = existingFiles.includes('package.json');
  const hasTsconfig = existingFiles.includes('tsconfig.json');
  const hasEntry = existingFiles.some(f => /^src\/index\.(ts|tsx|js|jsx)$/.test(f));

  // If all scaffold files exist, skip
  if (hasPkg && hasTsconfig && hasEntry) {
    console.log('[scaffold] All scaffold files exist — skipping');
    return;
  }

  console.log(`[scaffold] Missing: pkg=${!hasPkg} tsconfig=${!hasTsconfig} entry=${!hasEntry}`);

  // Fetch project classification from intake
  const classificationThread = await prisma.projectThread.findFirst({
    where: {
      projectId: ctx.projectId,
      role: 'system',
      content: { contains: '"type"' },
    },
    orderBy: { createdAt: 'desc' },
  });

  let classification: { type: string; roles: string[]; description: string } = {
    type: 'frontend',
    roles: ['frontend-developer'],
    description: 'A modern frontend application',
  };

  if (classificationThread?.content) {
    try { classification = JSON.parse(classificationThread.content); } catch {}
  }

  // Fetch user description for context
  const threads = await prisma.projectThread.findMany({
    where: { projectId: ctx.projectId, role: 'user' },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  const userDescription = threads[0]?.content || classification.description;

  const sandbox = new FileSystemSandbox(ctx.workspacePath);

  // Generate scaffold using architect
  if (!hasPkg) {
    await generatePackageJson(sandbox, classification, userDescription, ctx);
  }

  if (!hasTsconfig) {
    await generateTsconfig(sandbox, ctx);
  }

  if (!hasEntry) {
    await generateEntryPoint(sandbox, classification, userDescription, ctx);
  }

  // .gitignore — always ensure it exists
  const hasGitignore = existingFiles.includes('.gitignore');
  if (!hasGitignore) {
    await sandbox.createFile('.gitignore', [
      'node_modules/',
      'dist/',
      '.env',
      '*.local',
    ].join('\n'));
    console.log('[scaffold] Created: .gitignore');
  }

  // README.md — basic if missing
  const hasReadme = existingFiles.some(f => /^README\.md$/i.test(f));
  if (!hasReadme) {
    await sandbox.createFile('README.md', generateReadme(classification, userDescription));
    console.log('[scaffold] Created: README.md');
  }

  console.log('[scaffold] Scaffold complete');
}

async function generatePackageJson(
  sandbox: FileSystemSandbox,
  classification: { type: string; description: string },
  userDescription: string,
  ctx: PipelineContext,
): Promise<void> {
  try {
    const response = await executor.execute({
      role: 'software-architect',
      taskType: 'architecture-plan',
      taskPrompt: `You are scaffolding a new project. Generate a package.json for the following project:

Type: ${classification.type}
Description: ${userDescription}

Return a valid JSON package.json object with:
- name (use "brickops-app")
- version ("0.0.1")
- type: "module"
- private: true
- scripts: build, dev, preview (for a modern web app using vite)
- dependencies and devDependencies appropriate for this project type

For a fullstack/frontend project, include: react, react-dom, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react
For a backend project, include appropriate server dependencies.

IMPORTANT: Return ONLY the raw JSON object. No markdown, no backticks.`,
      actionSchema: `{ "name": "string", "version": "string", "type": "module", "private": true, "scripts": { ... }, "dependencies": { ... }, "devDependencies": { ... } }`,
      maxTokens: 2048,
    });

    const pkg = response.parsedJson;
    if (pkg && pkg.name && pkg.scripts) {
      await sandbox.createFile('package.json', JSON.stringify(pkg, null, 2) + '\n');
      console.log('[scaffold] Created: package.json (from architect)');
      return;
    }
  } catch (err: any) {
    console.warn(`[scaffold] Architect package.json generation failed: ${err.message}`);
  }

  // Fallback: generate a minimal package.json
  const fallbackPkg = {
    ...MIN_PKG,
    scripts: MIN_SCRIPTS,
    dependencies: {
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
    devDependencies: {
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      '@vitejs/plugin-react': '^4.3.0',
      typescript: '^5.5.0',
      vite: '^6.0.0',
      ...(classification.type === 'backend' ? {} : {}),
    },
  };

  await sandbox.createFile('package.json', JSON.stringify(fallbackPkg, null, 2) + '\n');
  console.log('[scaffold] Created: package.json (fallback)');
}

async function generateTsconfig(
  sandbox: FileSystemSandbox,
  ctx: PipelineContext,
): Promise<void> {
  try {
    const response = await executor.execute({
      role: 'software-architect',
      taskType: 'architecture-plan',
      taskPrompt: `Generate a tsconfig.json for a modern TypeScript project using Vite.

The config should be strict (strict: true), use ESNext modules, and support JSX (react-jsx).

IMPORTANT: Return ONLY the raw JSON object inside "compilerOptions". No markdown.
Example valid response:
{ "target": "ES2022", "module": "ESNext", "strict": true, ... }`,
      actionSchema: `{ "compilerOptions": { ... } }`,
      maxTokens: 1024,
    });

    const compilerOptions = response.parsedJson?.compilerOptions || response.parsedJson;
    if (compilerOptions && compilerOptions.target) {
      await sandbox.createFile('tsconfig.json', JSON.stringify({
        compilerOptions,
        include: ['src'],
      }, null, 2) + '\n');
      console.log('[scaffold] Created: tsconfig.json (from architect)');
      return;
    }
  } catch (err: any) {
    console.warn(`[scaffold] Architect tsconfig generation failed: ${err.message}`);
  }

  await sandbox.createFile('tsconfig.json', JSON.stringify(DEFAULT_TS_CONFIG, null, 2) + '\n');
  console.log('[scaffold] Created: tsconfig.json (fallback)');
}

async function generateEntryPoint(
  sandbox: FileSystemSandbox,
  classification: { type: string; description: string },
  userDescription: string,
  ctx: PipelineContext,
): Promise<void> {
  const isReact = classification.type === 'fullstack' || classification.type === 'frontend';

  try {
    const response = await executor.execute({
      role: 'frontend-developer',
      taskType: 'code-scaffold',
      taskPrompt: `Create a ${isReact ? 'React' : 'TypeScript'} entry point file (src/index.ts${isReact ? 'x' : ''}) for this project:

Description: ${userDescription}
Type: ${classification.type}

For React: import React, createRoot, render an App component with a simple loading/setup message.
For TypeScript: export a main() function that logs a setup message.

IMPORTANT: Return ONLY the file content as a string. No markdown backticks.`,
      actionSchema: `{ "content": "string" }`,
      maxTokens: 2048,
    });

    if (response.parsedJson?.content) {
      const ext = isReact ? 'tsx' : 'ts';
      await sandbox.createFile(`src/index.${ext}`, response.parsedJson.content);
      console.log(`[scaffold] Created: src/index.${ext} (from developer)`);
      return;
    }
  } catch (err: any) {
    console.warn(`[scaffold] Entry point generation failed: ${err.message}`);
  }

  // Fallback entry point
  const ext = isReact ? 'tsx' : 'ts';
  const fallbackEntry = isReact
    ? `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div>
      <h1>BrickOps App</h1>
      <p>Loading...</p>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
`
    : `export function main(): void {
  console.log('BrickOps app starting...');
}

main();
`;

  await sandbox.createFile(`src/index.${ext}`, fallbackEntry);
  console.log(`[scaffold] Created: src/index.${ext} (fallback)`);
}

function generateReadme(
  classification: { type: string; description: string },
  userDescription: string,
): string {
  return `# BrickOps App

${userDescription}

## Getting Started

\`\`\`bash
bun install
bun run dev
\`\`\`

## Build

\`\`\`bash
bun run build
\`\`\`
`;
}

async function listAllFiles(workspacePath: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else files.push(path.relative(workspacePath, full));
      }
    } catch {}
  }
  await walk(workspacePath);
  return files;
}
