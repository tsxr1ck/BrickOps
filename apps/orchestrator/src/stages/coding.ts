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
  // Try AI first
  try {
    const actions = await tryAIEdit(editRequest, existingFiles, workspacePath);
    if (actions.length > 0) return actions;
  } catch (err: any) {
    console.warn('[coding] AI edit failed:', err.message);
  }

  // Smart fallback that produces real changes
  return buildFallbackEdit(editRequest, workspacePath, existingFiles);
}

async function tryAIEdit(editRequest: string, existingFiles: string[], workspacePath: string): Promise<Action[]> {
  const keyFiles = ['src/App.tsx', 'src/main.tsx', 'index.html'];
  const fileContents: string[] = [];

  for (const file of keyFiles) {
    if (existingFiles.includes(file)) {
      try {
        const content = await fs.readFile(path.join(workspacePath, file), 'utf-8');
        fileContents.push(`FILE: ${file}\n\`\`\`\n${content.slice(0, 1000)}\n\`\`\``);
      } catch {}
    }
  }

  if (fileContents.length === 0) return [];

  const response = await executor.execute({
    role: 'frontend-developer',
    taskType: 'code-edit',
    taskPrompt: `Rewrite the following React files to implement this request: "${editRequest}"

${fileContents.join('\n\n')}

Respond with COMPLETE new file contents using create_file actions:
[{"action":"create_file","path":"src/App.tsx","content":"// full new file content"}]`,
    actionSchema: `[ { "action": "create_file", "path": "string", "content": "string" } ]`,
    maxTokens: 4096,
  });

  return Array.isArray(response.parsedJson) ? response.parsedJson : [];
}

function buildFallbackEdit(request: string, workspacePath: string, existingFiles: string[]): Action[] {
  const lower = request.toLowerCase();
  const actions: Action[] = [];
  const fp = (p: string) => path.join(workspacePath, p);

  // Determine what kind of page to generate
  const needsHeader = /header|nav/i.test(lower);
  const needsFooter = /footer/i.test(lower);
  const needsUnderConstruction = /under construction|coming soon|maintenance/i.test(lower);
  const needsHero = /hero|landing|home page|recreate|redo/i.test(lower);
  const needsCTA = /cta|button|call to action|sign up|get started/i.test(lower);
  const needsDark = /dark|dark mode|dark theme/i.test(lower);
  const hasTailwind = existingFiles.includes('tailwind.config.ts') || existingFiles.includes('tailwind.config.js');
  const needsStyle = /aesthetic|design|look|improve|better|rework|style|beautiful|modern/i.test(lower);

  // Decide what App.tsx content to generate
  let appContent: string;
  let addComponentFiles: Action[] = [];

  if (needsUnderConstruction || needsHero || needsHeader || needsFooter || needsStyle) {
    // Generate a proper landing page with header/footer/hero/under-construction
    const hasPages = existingFiles.some(f => f.startsWith('src/components/'));

    const headerCode = needsHeader ? `
      <header style={{ background: 'rgba(255,255,255,0.95)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#1a1a2e' }}>🚀 Project</h2>
        <nav style={{ display: 'flex', gap: '1.5rem' }}>
          <a href="#" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 500 }}>Home</a>
          <a href="#" style={{ color: '#64748b', textDecoration: 'none' }}>About</a>
          <a href="#" style={{ color: '#64748b', textDecoration: 'none' }}>Contact</a>
        </nav>
      </header>` : '';

    const footerCode = needsFooter ? `
      <footer style={{ padding: '2rem', textAlign: 'center', background: '#1a1a2e', color: '#94a3b8', fontSize: '0.85rem' }}>
        <p>© 2026 Project. All rights reserved.</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.5rem' }}>
          <a href="#" style={{ color: '#6366f1', textDecoration: 'none' }}>Privacy</a>
          <a href="#" style={{ color: '#6366f1', textDecoration: 'none' }}>Terms</a>
          <a href="#" style={{ color: '#6366f1', textDecoration: 'none' }}>Contact</a>
        </div>
      </footer>` : '';

    const underConstructionCode = needsUnderConstruction ? `
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '3rem', background: 'rgba(255,255,255,0.1)', borderRadius: '20px',
            backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)',
            maxWidth: '500px', width: '100%', margin: '2rem auto',
          }}>
            <span style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚧</span>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#fff' }}>
              Under Construction
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 1.6 }}>
              We're working hard to bring you something amazing.<br />Stay tuned!
            </p>
          </div>` : '';

    const heroCode = needsHero ? `
        <section style={{ textAlign: 'center', paddingTop: '3rem' }}>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            fontWeight: 800,
            color: '#fff',
            marginBottom: '1rem',
            lineHeight: 1.2,
          }}>
            We're Building Something Great
          </h1>
          <p style={{
            fontSize: '1.2rem',
            color: 'rgba(255,255,255,0.8)',
            maxWidth: '600px',
            margin: '0 auto 2rem',
            lineHeight: 1.6,
          }}>
            Our team is hard at work creating an amazing experience. We'll be launching soon with something special.
          </p>
        </section>` : '';

    const ctaCode = needsCTA ? `
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button style={{
              background: '#fff', color: '#6366f1', border: 'none',
              padding: '1rem 2.5rem', fontSize: '1.1rem', fontWeight: 600,
              borderRadius: '12px', cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              transition: 'transform 0.2s',
            }}>
              Get Started
            </button>
            <p style={{ marginTop: '1rem', color: 'rgba(255,255,255,0.7)' }}>No credit card required</p>
          </div>` : '';

    // Build the complete App.tsx
    const projectName = "Project";
    const heroTitle = needsUnderConstruction ? "We're Building Something Great" : "Build Faster with AI";
    const heroSubtitle = needsUnderConstruction 
      ? "Our team is hard at work creating an amazing experience. We'll be launching soon with something special."
      : "Create, deploy, and manage projects with the power of AI. Start building in minutes, not weeks.";

    appContent = `export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>
      ${headerCode}

      <main style={{ flex: 1, padding: '2rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        ${heroCode}
        ${underConstructionCode || ctaCode}
      </main>

      ${footerCode}
    </div>
  );
}`;
  } else if (needsDark) {
    appContent = `export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '4rem 2rem',
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: '3rem', fontWeight: 800 }}>Dark Mode</h1>
      <p style={{ color: '#94a3b8', fontSize: '1.2rem', marginTop: '1rem' }}>Your app in dark theme.</p>
    </div>
  );
}`;
  } else {
    // Generic improvement
    appContent = `export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: '3rem', fontWeight: 800 }}>Welcome</h1>
      <p style={{ fontSize: '1.2rem', opacity: 0.9, maxWidth: '500px', marginTop: '1rem' }}>
        Your improved project is ready.
      </p>
    </div>
  );
}`;
  }

  actions.push({
    action: 'create_file',
    path: 'src/App.tsx',
    content: appContent,
  });

  // Add any extra component files
  actions.push(...addComponentFiles);

  return actions;
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
