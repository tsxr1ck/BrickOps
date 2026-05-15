import type { PipelineContext } from '../pipeline';
import { prisma } from '@brickops/db';
import { FileSystemSandbox } from '@brickops/execution';
import type { Action, ParallelTask } from '@brickops/contracts';
import { executor } from '../executor';
import fs from 'fs/promises';
import path from 'path';

/**
 * Concurrency limiter — prevents hitting API rate limits
 * when spawning parallel agents.
 */
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}

/**
 * Coding stage — handles both initial scaffold and re-entrant edits.
 */

export async function runCoding(ctx: PipelineContext, compilerErrors?: string): Promise<void> {
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

  if (compilerErrors) {
    console.log(`[coding] Fix-errors mode — compiler reported errors`);
    actions = await generateFixActions(description, compilerErrors, existingFiles, ctx.workspacePath);
  } else if (isEdit) {
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

/**
 * Parallel coding — spawns an agent for each independent task from the PM.
 *
 * Each agent receives ONLY its assigned files as context.
 * All agents run concurrently with a concurrency limiter
 * to avoid API rate limits (max 2 simultaneous LLM calls).
 */
export async function runParallelCoding(
  ctx: PipelineContext,
  tasks: ParallelTask[]
): Promise<void> {
  console.log(`[coding] Spawning ${tasks.length} parallel agents...`);

  if (!ctx.workspacePath) {
    throw new Error('No workspace path — provisioning must run first');
  }

  const limiter = new ConcurrencyLimiter(2);
  const sandbox = new FileSystemSandbox(ctx.workspacePath);

  const agentPromises = tasks.map(async (task, index) => {
    await limiter.acquire();

    try {
      console.log(`[coding] Agent ${index + 1}/${tasks.length}: ${task.agentRole} → ${task.filesToEdit.join(', ')}`);

      // Read ONLY the files assigned to this task
      const fileContents: string[] = [];
      for (const filePath of task.filesToEdit) {
        try {
          const fullPath = path.join(ctx.workspacePath!, filePath);
          const content = await fs.readFile(fullPath, 'utf-8');
          fileContents.push(`### ${filePath}\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\``);
        } catch {
          // File doesn't exist yet — agent will create it
          fileContents.push(`### ${filePath} (new file — does not exist yet)`);
        }
      }

      const response = await executor.execute({
        role: task.agentRole as any,
        taskType: 'code-edit',
        taskPrompt: `You are a ${task.agentRole} working on an isolated task. Your job: ${task.specificInstructions}

## Your Assigned Files (ONLY edit these)
${fileContents.join('\n\n')}

## Instructions
1. You may ONLY edit the files listed above
2. Other agents are working on other files in parallel — do NOT touch files not assigned to you
3. If another agent is building a function you need, assume the function signature specified in your instructions exists
4. Use patch_file for targeted edits, create_file for new files
5. Produce real, working code — no placeholders

Respond with a JSON array of actions.`,
        actionSchema: `[ { "action": "patch_file", "path": "string", "search": "string", "replace": "string" }, { "action": "create_file", "path": "string", "content": "string" } ]`,
        maxTokens: 8192,
      });

      const actions: Action[] = Array.isArray(response.parsedJson) ? response.parsedJson : [];

      // Apply each action to the workspace
      let executed = 0;
      for (const action of actions) {
        try {
          switch (action.action) {
            case 'create_file':
              await sandbox.createFile(action.path, action.content);
              console.log(`[coding:${task.agentRole}] Created: ${action.path}`);
              break;
            case 'patch_file':
              await sandbox.patchFile(action.path, action.search, action.replace);
              console.log(`[coding:${task.agentRole}] Patched: ${action.path}`);
              break;
            case 'delete_file':
              await sandbox.deleteFile(action.path);
              console.log(`[coding:${task.agentRole}] Deleted: ${action.path}`);
              break;
            case 'run_command':
              console.log(`[coding:${task.agentRole}] Command (skipped in parallel mode): ${action.command}`);
              break;
          }
          executed++;
        } catch (err: any) {
          console.warn(`[coding:${task.agentRole}] Action failed for ${(action as any).path}: ${err.message}`);
        }
      }

      console.log(`[coding] Agent ${index + 1} finished: ${executed}/${actions.length} actions`);
      return { task, actions, executed };
    } catch (err: any) {
      console.error(`[coding] Agent ${index + 1} failed:`, err.message);
      return { task, actions: [], executed: 0, error: err.message };
    } finally {
      limiter.release();
    }
  });

  const results = await Promise.all(agentPromises);

  const totalActions = results.reduce((sum, r) => sum + r.actions.length, 0);
  const totalExecuted = results.reduce((sum, r) => sum + r.executed, 0);
  const failures = results.filter((r) => 'error' in r);

  console.log(`[coding] Parallel stage complete: ${totalExecuted}/${totalActions} actions across ${tasks.length} agents`);
  if (failures.length > 0) {
    console.warn(`[coding] ${failures.length} agent(s) failed: ${failures.map((f: any) => f.error).join('; ')}`);
  }

  // Store summary thread
  await prisma.projectThread.create({
    data: {
      projectId: ctx.projectId,
      role: 'system',
      content: JSON.stringify({
        stage: 'coding',
        mode: 'parallel',
        agents: tasks.length,
        totalActions,
        executed: totalExecuted,
        failures: failures.length,
        files: results.flatMap((r) =>
          r.actions
            .filter((a): a is Extract<Action, { action: 'create_file' }> => a.action === 'create_file')
            .map((a) => (a as { action: 'create_file'; path: string }).path)
        ),
      }),
    },
  });
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
  // Try AI edit with full context
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const actions = await tryAIEdit(editRequest, existingFiles, workspacePath, attempt);
      if (actions.length > 0) return actions;
      console.warn(`[coding] AI edit attempt ${attempt + 1} returned empty`);
    } catch (err: any) {
      console.warn(`[coding] AI edit attempt ${attempt + 1} failed:`, err.message);
    }
  }

  // Last resort: use AI scaffold to generate a complete rewrite with full context
  try {
    const actions = await tryAIScaffoldEdit(editRequest, existingFiles, workspacePath);
    if (actions.length > 0) return actions;
  } catch (err: any) {
    console.warn('[coding] AI scaffold edit failed:', err.message);
  }

  // Absolute last resort: keyword-based fallback
  return buildFallbackEdit(editRequest, workspacePath, existingFiles);
}

async function tryAIScaffoldEdit(
  editRequest: string,
  existingFiles: string[],
  workspacePath: string,
): Promise<Action[]> {
  // Read all source files for full context
  const sourceFiles = existingFiles.filter((f) =>
    /\.(tsx?|jsx?|css|html)$/.test(f) && !f.includes('node_modules')
  );
  const fileContents: string[] = [];

  for (const file of sourceFiles.slice(0, 10)) {
    try {
      const content = await fs.readFile(path.join(workspacePath, file), 'utf-8');
      const truncated = content.length > 1500 ? content.slice(0, 1500) + '\n// ... (truncated)' : content;
      fileContents.push(`### ${file}\n\`\`\`\n${truncated}\n\`\`\``);
    } catch {}
  }

  if (fileContents.length === 0) return [];

  const response = await executor.execute({
    role: 'frontend-developer',
    taskType: 'code-scaffold',
    taskPrompt: `You are rewriting an existing project. Here is the full current state:

${fileContents.join('\n\n')}

Rewrite the project to implement this request: "${editRequest}"

Use patch_file for targeted changes where possible. Use create_file for new files or files that need complete rewrites.
Respond with a JSON array of actions.`,
    actionSchema: `[ { "action": "patch_file", "path": "string", "search": "string", "replace": "string" }, { "action": "create_file", "path": "string", "content": "string" } ]`,
    maxTokens: 8192,
  });

  return Array.isArray(response.parsedJson) ? response.parsedJson : [];
}

async function tryAIEdit(
  editRequest: string,
  existingFiles: string[],
  workspacePath: string,
  _attempt: number = 0,
): Promise<Action[]> {
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

  // Phase 1: Figure out WHICH files need to be touched
  const planResponse = await executor.execute({
    role: 'software-architect',
    taskType: 'code-edit',
    taskPrompt: `Analyze the user's edit request and the current code context. 
Determine exactly which files need to be modified or created.

Request: "${editRequest}"

Context:
${fileContents.join('\n\n')}

Return a JSON array of specific file paths to edit or create.`,
    actionSchema: `[ "string" ]`,
    maxTokens: 1024,
  });

  const filesToEdit: string[] = Array.isArray(planResponse.parsedJson)
    ? planResponse.parsedJson
    : [];

  const actions: Action[] = [];

  // Phase 2: Loop through each file and apply the specific patch/edit
  for (const file of filesToEdit) {
    const fileContentStr = fileContents.find(fc => fc.startsWith(`FILE: ${file}`)) || 'New file';

    try {
      const fileResponse = await executor.execute({
        role: 'frontend-developer',
        taskType: 'code-edit',
        taskPrompt: `Implement the requested edit for ONLY the following file: ${file}

Request: "${editRequest}"

Current File Context:
${fileContentStr}

Respond with the complete, updated file content.`,
        actionSchema: `{ "content": "string" }`,
        maxTokens: 4096,
      });

      if (fileResponse.parsedJson?.content) {
        actions.push({ action: 'create_file', path: file, content: fileResponse.parsedJson.content });
      }
    } catch (err: any) {
      console.warn(`[coding] Failed to edit file ${file}:`, err.message);
    }
  }

  return actions;
}

async function generateFixActions(
  description: string,
  compilerErrors: string,
  existingFiles: string[],
  workspacePath: string,
): Promise<Action[]> {
  try {
    const actions = await tryAIFix(compilerErrors, existingFiles, workspacePath);
    if (actions.length > 0) return actions;
  } catch (err: any) {
    console.warn('[coding] AI fix failed:', err.message);
  }
  // Fallback: treat as a generic edit
  return buildFallbackEdit('fix compilation errors', workspacePath, existingFiles);
}

async function tryAIFix(compilerErrors: string, existingFiles: string[], workspacePath: string): Promise<Action[]> {
  const keyFiles = ['src/App.tsx', 'src/main.tsx', 'src/index.ts', 'index.html'];
  const fileContents: string[] = [];

  for (const file of keyFiles) {
    if (existingFiles.includes(file)) {
      try {
        const content = await fs.readFile(path.join(workspacePath, file), 'utf-8');
        fileContents.push(`FILE: ${file}\n\`\`\`\n${content.slice(0, 1500)}\n\`\`\``);
      } catch {}
    }
  }

  if (fileContents.length === 0) return [];

  const errorSummary = compilerErrors.slice(0, 2000);

  const response = await executor.execute({
    role: 'minimal-change-engineer',
    taskType: 'code-edit',
    taskPrompt: `The generated code failed to compile with TypeScript errors. Fix ALL errors by patching the affected files.

## Compiler Errors
\`\`\`
${errorSummary}
\`\`\`

## Current Files
${fileContents.join('\n\n')}

Use patch_file actions to make minimal, targeted fixes. Do NOT rewrite entire files.
Respond with a JSON array of patch_file actions:
[{"action":"patch_file","path":"src/App.tsx","search":"exact broken line","replace":"fixed line"}]`,
    actionSchema: `[ { "action": "patch_file", "path": "string", "search": "string", "replace": "string" }, { "action": "create_file", "path": "string", "content": "string" } ]`,
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
    // Use request text itself — better than a generic "Welcome"
    const cleanRequest = request.replace(/^edit\s+/i, '').replace(/^the\s+/i, '');
    const title = cleanRequest.length > 60 ? cleanRequest.slice(0, 57) + '...' : cleanRequest;
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
      <h1 style={{ fontSize: '2.5rem', fontWeight: 800, maxWidth: '600px' }}>{${JSON.stringify(title)}}</h1>
      <p style={{ fontSize: '1.1rem', opacity: 0.85, maxWidth: '500px', marginTop: '1.5rem' }}>
        Edit applied successfully.
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
    console.log(`[coding] Delegating task breakdown to architect agent...`);
    const breakdownResponse = await executor.execute({
      role: 'software-architect',
      taskType: 'code-planning',
      taskPrompt: `Based on the implementation plan, provide a complete list of file paths that need to be generated for this project scaffold.

Project Type: ${classification.type}
Description: ${description}

Implementation Plan:
${plan}

Only respond with a JSON array of file paths. Do not include any code content.`,
      actionSchema: `[ "string" ]`,
      maxTokens: 1024,
    });

    const filePaths: string[] = Array.isArray(breakdownResponse.parsedJson)
      ? breakdownResponse.parsedJson
      : ['package.json', 'tsconfig.json', 'src/index.ts', 'README.md', '.gitignore'];

    console.log(`[coding] Subagent task breakdown yielded ${filePaths.length} files to create.`);

    const actions: Action[] = [];

    for (const filePath of filePaths) {
      console.log(`[coding] Subagent generating content for: ${filePath}`);

      try {
        const fileResponse = await executor.execute({
          role: 'frontend-developer',
          taskType: 'code-scaffold',
          taskPrompt: `You are generating a single file for a larger project.

File Path to Generate: ${filePath}

Project Plan Context:
${plan}

Write the COMPLETE, fully working code for exactly this file. Do not use placeholders.`,
          actionSchema: `{ "content": "string" }`,
          maxTokens: 4096,
        });

        if (fileResponse.parsedJson?.content) {
          actions.push({
            action: 'create_file',
            path: filePath,
            content: fileResponse.parsedJson.content,
          });
        }
      } catch (fileErr: any) {
        console.warn(`[coding] Subagent failed for ${filePath}: ${fileErr.message}`);
      }
    }

    if (actions.length === 0) throw new Error('Subagent loop yielded no files');

    return actions;
  } catch (err) {
    console.warn('[coding] Iterative scaffold failed, using fallback:', err);
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
