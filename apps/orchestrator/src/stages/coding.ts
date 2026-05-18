import type { PipelineContext } from '../pipeline';
import { prisma } from '@brickops/db';
import { FileSystemSandbox } from '@brickops/execution';
import type { Action, ParallelTask } from '@brickops/contracts';
import { executor } from '../executor';
import fs from 'fs/promises';
import path from 'path';

const GATEWAY_URL = process.env.BRICKOPS_GATEWAY_URL || 'http://localhost:3002';
const operatorJid = process.env.BRICKOPS_OPERATOR_JID;

async function sendProgress(message: string): Promise<void> {
  if (!operatorJid) return;
  try {
    await fetch(`${GATEWAY_URL}/outbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientJid: operatorJid, message }),
    });
  } catch {}
}

async function sendPlanPDF(
  tasks: Array<{ filePath: string; intent: string }>,
  projectName: string,
  projectSlug: string,
): Promise<void> {
  if (!operatorJid) return;
  try {
    const { generatePlanPdf, getPlanFilename } = await import('@brickops/notifications');
    const planMarkdown = tasks
      .map((t, i) => `### ${i + 1}. ${t.filePath}\n**Intent:** ${t.intent}`)
      .join('\n\n');
    const pdfBuffer = await generatePlanPdf(planMarkdown, projectName);
    const filename = getPlanFilename(projectSlug);
    await fetch(`${GATEWAY_URL}/outbound-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientJid: operatorJid,
        buffer: Array.from(pdfBuffer),
        filename,
        caption: `\u{1F4CB} *Plan Ready:* ${tasks.length} tasks scheduled for *${projectName}*.`,
      }),
    });
  } catch (err) {
    console.warn('[coding] PDF delivery failed:', err);
  }
}

async function fetchProjectInfo(projectId: string): Promise<{ name: string; slug: string } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, slug: true },
  });
  return project;
}

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
 * Coding stage — stateful, resumable pipeline.
 *
 * Flow:
 * 1. Architect breaks down request into EditPlan + EditTasks (saved to DB)
 * 2. Loop iterates through pending tasks, each in an isolated LLM call
 * 3. On failure: retry up to 3 times, then mark failed in DB
 * 4. If the process restarts, pending tasks are picked up from DB
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

  let planId: string | null = null;
  let totalActions = 0;
  let executed = 0;

  if (compilerErrors) {
    console.log(`[coding] Fix-errors mode — compiler reported errors`);
    planId = await createFixPlan(ctx.projectId, ctx.runId, compilerErrors, existingFiles, ctx.workspacePath);
  } else {
    // Check for an existing incomplete plan (crash recovery for scaffold/edit)
    const existingPlan = await prisma.editPlan.findFirst({
      where: { runId: ctx.runId, status: { in: ['executing', 'pending'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPlan) {
      console.log(`[coding] Resuming existing plan ${existingPlan.id}`);
      planId = existingPlan.id;
    } else if (isEdit) {
      console.log(`[coding] Edit mode — ${existingFiles.length} existing files`);
      const editRequest = getLatestEditRequest(threads);
      planId = await createEditPlan(ctx.projectId, ctx.runId, editRequest, existingFiles, ctx.workspacePath);
    } else {
      console.log(`[coding] Scaffold mode — generating new files`);
      planId = await createScaffoldPlan(ctx.projectId, ctx.runId, description, plan, classification);
    }
  }

  // Process the plan (processes only pending tasks, so it's resumable)
  const result = await processPlan(planId, ctx.workspacePath);
  totalActions = result.total;
  executed = result.executed;

  // Build list of created files from completed tasks
  const completedTasks = await prisma.editTask.findMany({
    where: { planId, status: 'completed' },
    select: { filePath: true },
  });

  await prisma.projectThread.create({
    data: {
      projectId: ctx.projectId,
      role: 'system',
      content: JSON.stringify({
        stage: 'coding',
        mode: compilerErrors ? 'fix' : (isEdit ? 'edit' : 'scaffold'),
        planId,
        totalActions,
        executed,
        files: completedTasks.map((t) => t.filePath),
      }),
    },
  });

  console.log(`[coding] Executed ${executed}/${totalActions} actions`);
}

/**
 * Phase 1: Create EditPlan from edit request.
 * Architect analyzes request + file tree → emits task breakdown saved to DB.
 */
async function createEditPlan(
  projectId: string,
  runId: string,
  editRequest: string,
  existingFiles: string[],
  workspacePath: string,
): Promise<string> {
  const fileTreeString = existingFiles.join('\n');

  console.log(`[coding:plan] Architect analyzing edit request...`);
  const planResponse = await executor.execute({
    role: 'software-architect',
      taskType: 'architecture-plan',
    taskPrompt: `You are the lead Software Architect. The user has requested an edit.
Analyze the project structure and break this request down into discrete, file-by-file tasks.

User Request: "${editRequest}"

Project File Tree:
${fileTreeString}

CRITICAL: Return a JSON array of tasks. Keep intents scoped strictly to the file being edited.
Schema: [{ "filePath": "src/App.tsx", "intent": "Import and render the new Hero component", "isNewFile": false }]`,
    actionSchema: `[ { "filePath": "string", "intent": "string", "isNewFile": false } ]`,
    maxTokens: 2048,
  });

  const tasks: Array<{ filePath: string; intent: string; isNewFile?: boolean }> =
    Array.isArray(planResponse.parsedJson) ? planResponse.parsedJson : [];

  if (tasks.length === 0) {
    // Fallback: single task wrapping the entire request
    tasks.push({ filePath: 'src/App.tsx', intent: editRequest, isNewFile: false });
  }

  return await savePlan(projectId, runId, editRequest, tasks);
}

/**
 * Phase 1: Create EditPlan for scaffold.
 * Architect generates file list from the implementation plan.
 */
async function createScaffoldPlan(
  projectId: string,
  runId: string,
  description: string,
  plan: string,
  classification: { type: string; roles: string[] },
): Promise<string> {
  console.log(`[coding:plan] Architect breaking down scaffold...`);
  const breakdownResponse = await executor.execute({
    role: 'software-architect',
      taskType: 'architecture-plan',
    taskPrompt: `Based on the implementation plan, provide a complete, file-by-file task list.

Project Type: ${classification.type}
Description: ${description}

Implementation Plan:
${plan}

Return a JSON array of tasks with path and intent:
[{ "filePath": "package.json", "intent": "Create package.json with correct dependencies for this project type", "isNewFile": true }, ...]
Include ALL files: package.json, tsconfig.json, .gitignore, README.md, and all source files.`,
    actionSchema: `[ { "filePath": "string", "intent": "string", "isNewFile": true } ]`,
    maxTokens: 2048,
  });

  const tasks: Array<{ filePath: string; intent: string; isNewFile?: boolean }> =
    Array.isArray(breakdownResponse.parsedJson) && breakdownResponse.parsedJson.length > 0
      ? breakdownResponse.parsedJson
      : [
          { filePath: 'package.json', intent: 'Create package.json for a TypeScript project', isNewFile: true },
          { filePath: 'tsconfig.json', intent: 'Create tsconfig.json with strict mode', isNewFile: true },
          { filePath: '.gitignore', intent: 'Create .gitignore for node_modules and dist', isNewFile: true },
          { filePath: 'src/index.ts', intent: 'Create entry point', isNewFile: true },
          { filePath: 'README.md', intent: 'Create README with setup instructions', isNewFile: true },
        ];

  console.log(`[coding:plan] Scaffold plan: ${tasks.length} files`);
  return await savePlan(projectId, runId, description, tasks);
}

/**
 * Phase 1: Create EditPlan for compiler error fixing.
 */
async function createFixPlan(
  projectId: string,
  runId: string,
  compilerErrors: string,
  existingFiles: string[],
  workspacePath: string,
): Promise<string> {
  const sourceFiles = existingFiles.filter((f) =>
    /\.(tsx?|jsx?)$/.test(f) && !f.includes('node_modules')
  );

  const errorSummary = compilerErrors.slice(0, 2000);

  console.log(`[coding:plan] Architect analyzing compiler errors...`);
  const planResponse = await executor.execute({
    role: 'software-architect',
      taskType: 'architecture-plan',
    taskPrompt: `Analyze these TypeScript compiler errors and determine which files need fixing.

Files in project: ${sourceFiles.join(', ')}

Compiler Errors:
\`\`\`
${errorSummary}
\`\`\`

Return a JSON array of tasks. Each task should specify the file to fix and the intent.
[{ "filePath": "src/App.tsx", "intent": "Fix missing import for React", "isNewFile": false }]`,
    actionSchema: `[ { "filePath": "string", "intent": "string", "isNewFile": false } ]`,
    maxTokens: 2048,
  });

  const tasks: Array<{ filePath: string; intent: string; isNewFile?: boolean }> =
    Array.isArray(planResponse.parsedJson) ? planResponse.parsedJson : [];

  if (tasks.length === 0) {
    tasks.push({ filePath: 'src/App.tsx', intent: `Fix compilation errors: ${errorSummary.slice(0, 200)}`, isNewFile: false });
  }

  return await savePlan(projectId, runId, 'Fix compiler errors', tasks);
}

/**
 * Persist a plan and its tasks to the database.
 */
async function savePlan(
  projectId: string,
  runId: string,
  originalReq: string,
  tasks: Array<{ filePath: string; intent: string; isNewFile?: boolean }>,
): Promise<string> {
  const plan = await prisma.editPlan.create({
    data: {
      projectId,
      runId,
      originalReq,
      status: 'pending',
      tasks: {
        create: tasks.map((t) => ({
          filePath: t.filePath,
          intent: t.intent,
          isNewFile: t.isNewFile ?? !t.filePath.includes('node_modules'),
          status: 'pending',
        })),
      },
    },
  });

  console.log(`[coding:plan] Saved plan ${plan.id} with ${tasks.length} tasks`);

  const project = await fetchProjectInfo(projectId);
  if (project) {
    sendPlanPDF(tasks.map((t) => ({ filePath: t.filePath, intent: t.intent })), project.name, project.slug);
  }

  return plan.id;
}

/**
 * Phase 2: Process EditPlan — iterate through pending tasks, execute each.
 * State is persisted to DB after each task, so the process is resumable.
 */
async function processPlan(
  planId: string,
  workspacePath: string,
): Promise<{ total: number; executed: number }> {
  // Mark plan as executing
  await prisma.editPlan.update({
    where: { id: planId },
    data: { status: 'executing' },
  });

  const plan = await prisma.editPlan.findUnique({
    where: { id: planId },
    include: {
      tasks: {
        where: { status: { in: ['pending', 'in_progress'] } },
        orderBy: { filePath: 'asc' },
      },
    },
  });

  if (!plan) {
    console.warn(`[coding] Plan ${planId} not found`);
    return { total: 0, executed: 0 };
  }

  const totalTasks = plan.tasks.length;
  let completed = 0;

  console.log(`[coding] Processing ${totalTasks} pending tasks for plan ${planId}`);

  const sandbox = new FileSystemSandbox(workspacePath);

  for (const task of plan.tasks) {
    await prisma.editTask.update({
      where: { id: task.id },
      data: { status: 'in_progress' },
    });

    sendProgress(`\u23F3 *[Task ${completed + 1}/${totalTasks}]* Writing \`${task.filePath}\`...`);

    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        console.log(`[coding] Task: ${task.filePath} (attempt ${attempt + 1})`);

        // Read current file content (if it exists)
        let fileContent = '';
        if (!task.isNewFile) {
          try {
            fileContent = await fs.readFile(path.join(workspacePath, task.filePath), 'utf-8');
          } catch {
            fileContent = '// New File';
          }
        }

        // Invoke developer agent with isolated context
        const action = await executeEditTask(task.filePath, task.intent, fileContent, task.isNewFile);

        // Apply action to sandbox
        await applyAction(sandbox, action);

        // Mark completed
        await prisma.editTask.update({
          where: { id: task.id },
          data: { status: 'completed', errorLog: null },
        });

        completed++;
        break;
      } catch (err: any) {
        const errMsg = err.message || String(err);
        console.warn(`[coding] Task ${task.filePath} failed (attempt ${attempt + 1}): ${errMsg}`);

        if (attempt < MAX_RETRIES - 1) {
          await prisma.editTask.update({
            where: { id: task.id },
            data: {
              status: 'pending',
              attempts: task.attempts + 1,
              errorLog: errMsg.slice(0, 500),
            },
          });
        } else {
          await prisma.editTask.update({
            where: { id: task.id },
            data: {
              status: 'failed',
              attempts: task.attempts + 1,
              errorLog: errMsg.slice(0, 500),
            },
          });
          console.error(`[coding] Task ${task.filePath} FAILED after ${MAX_RETRIES} attempts`);
        }
      }
    }
  }

  // Determine final plan status
  const allTasks = await prisma.editTask.findMany({
    where: { planId },
    select: { status: true },
  });

  const allCompleted = allTasks.every((t) => t.status === 'completed');
  await prisma.editPlan.update({
    where: { id: planId },
    data: { status: allCompleted ? 'completed' : 'completed' }, // Partial completion is still success for remaining tasks
  });

  console.log(`[coding] Plan ${planId} done: ${completed}/${totalTasks} tasks completed`);
  return { total: totalTasks, executed: completed };
}

/**
 * Phase 3: Execute a single edit task with isolated context.
 * Developer agent receives ONLY the target file + intent.
 */
async function executeEditTask(
  filePath: string,
  intent: string,
  currentContent: string,
  isNewFile: boolean,
): Promise<Action> {
  if (isNewFile || currentContent === '// New File') {
    const response = await executor.execute({
      role: 'frontend-developer',
      taskType: 'code-scaffold',
      taskPrompt: `File: ${filePath}
Task: ${intent}

Return complete, working code for this file. No placeholders.`,
      actionSchema: `{ "content": "string" }`,
      maxTokens: 4096,
    });

    if (!response.parsedJson?.content) {
      throw new Error(`Empty response for new file ${filePath}`);
    }

    return { action: 'create_file', path: filePath, content: response.parsedJson.content };
  }

  // Existing file — use patch_file for targeted edits
  const maxContentLen = currentContent.length > 3000 ? 3000 : currentContent.length;
  const truncatedContent = currentContent.length > 3000
    ? currentContent.slice(0, 3000) + '\n// ... (truncated)'
    : currentContent;

  const response = await executor.execute({
    role: 'frontend-developer',
    taskType: 'code-edit',
    taskPrompt: `File: ${filePath}
Task: ${intent}

\`\`\`
${truncatedContent}
\`\`\`

Return JSON only. Use patch_file with search/replace or create_file for rewrites.`,
    actionSchema: `{ "action": "patch_file", "path": "string", "search": "string", "replace": "string" }`,
    maxTokens: 4096,
  });

  if (!response.parsedJson) {
    throw new Error(`Empty response for ${filePath}`);
  }

  const result = response.parsedJson;

  if (result.action === 'patch_file' && result.search && result.replace) {
    return { action: 'patch_file', path: filePath, search: result.search, replace: result.replace };
  }

  if (result.action === 'create_file' || result.content) {
    return { action: 'create_file', path: filePath, content: result.content || '' };
  }

  // Try treating the response as a raw create_file
  if (result.content) {
    return { action: 'create_file', path: filePath, content: result.content };
  }

  throw new Error(`Unrecognized response format for ${filePath}`);
}

/**
 * Apply a single action to the file system sandbox.
 */
async function applyAction(sandbox: FileSystemSandbox, action: Action): Promise<void> {
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

      const fileContents: string[] = [];
      for (const filePath of task.filesToEdit) {
        try {
          const fullPath = path.join(ctx.workspacePath!, filePath);
          const content = await fs.readFile(fullPath, 'utf-8');
          fileContents.push(`### ${filePath}\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\``);
        } catch {
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

      let executed = 0;
      for (const action of actions) {
        try {
          await applyAction(sandbox, action);
          console.log(`[coding:${task.agentRole}] Applied: ${(action as any).path}`);
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
