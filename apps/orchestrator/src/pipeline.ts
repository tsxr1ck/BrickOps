import { prisma } from "@brickops/db";
import type { ProjectStatus } from "@brickops/contracts";
import { deliverWhatsApp } from "@brickops/notifications";
import { bus } from "@brickops/events";
import { runIntake } from "./stages/intake";
import { runPlanning } from "./stages/planning";
import { runCoding, runParallelCoding } from "./stages/coding";
import { runValidation } from "./stages/validate";
import { runBuild } from "./stages/build";
import { runScaffold } from "./stages/scaffold";

function log(level: string, msg: string, ctx?: Record<string, unknown>) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    source: "pipeline",
    level,
    msg,
    ...ctx,
  });
  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "debug":
      console.debug(line);
      break;
    default:
      console.log(line);
  }
}

async function sendWhatsAppDocument(
  recipientJid: string,
  buffer: Buffer,
  filename: string,
  caption?: string,
): Promise<void> {
  if (!recipientJid) return;
  try {
    await fetch(`${process.env.BRICKOPS_GATEWAY_URL || "http://localhost:3002"}/outbound-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientJid,
        buffer: Array.from(buffer),
        filename,
        caption,
      }),
    });
  } catch (err) {
    log("error", "WhatsApp document send failed", { error: String(err) });
  }
}

async function sendWhatsAppImage(recipientJid: string, buffer: Buffer, caption?: string): Promise<void> {
  if (!recipientJid) return;
  try {
    await fetch(`${process.env.BRICKOPS_GATEWAY_URL || "http://localhost:3002"}/outbound-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientJid, buffer: Array.from(buffer), caption }),
    });
  } catch (err) {
    log("error", "WhatsApp image send failed", { error: String(err) });
  }
}

async function captureAndSendScreenshot(projectId: string, runId: string): Promise<void> {
  const operatorJid = process.env.BRICKOPS_OPERATOR_JID;
  if (!operatorJid) return;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, slug: true, source: true },
    });
    if (!project) return;

    const API_URL = `http://localhost:${process.env.PORT || 3001}`;

    // Start preview if not running
    let previewUrl: string | null = null;
    try {
      const statusRes = await fetch(`${API_URL}/projects/${projectId}/preview/status`);
      if (statusRes.ok) {
        const status = await statusRes.json();
        if (status.running) previewUrl = status.url;
      }
    } catch {}

    if (!previewUrl) {
      try {
        const startRes = await fetch(`${API_URL}/projects/${projectId}/preview/start`, { method: 'POST' });
        if (startRes.ok) {
          const data = await startRes.json();
          previewUrl = data.url;
        }
      } catch {}
    }

    if (!previewUrl) {
      log("warn", "Could not start preview for screenshot", { projectId, runId });
      return;
    }

    await new Promise((r) => setTimeout(r, 1500));

    // Use the API screenshot endpoint (handles Puppeteer directly)
    const isWhatsApp = project.source === 'whatsapp';
    const ssOptions = isWhatsApp ? { width: 390, height: 844 } : undefined;
    
    const ssRes = await fetch(`${API_URL}/projects/${projectId}/screenshot`, { 
      method: 'POST',
      headers: ssOptions ? { 'Content-Type': 'application/json' } : undefined,
      body: ssOptions ? JSON.stringify(ssOptions) : undefined
    });
    
    if (!ssRes.ok) {
      log("warn", "Screenshot API failed", { projectId, runId, status: ssRes.status });
      return;
    }

    const screenshotBuffer = Buffer.from(await ssRes.arrayBuffer());
    if (screenshotBuffer.length < 1000) return; // Too small, probably placeholder

    // Send via WhatsApp gateway (base64-encoded for JSON safety)
    await fetch(`${process.env.BRICKOPS_GATEWAY_URL || "http://localhost:3002"}/outbound-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientJid: operatorJid,
        base64: screenshotBuffer.toString('base64'),
        caption: `📸 ${project.name} — Preview`,
      }),
      signal: AbortSignal.timeout(15000),
    });

    log("info", "Screenshot sent to WhatsApp", { projectId, runId, projectName: project.name });
  } catch (err: any) {
    log("error", "Screenshot flow failed", { projectId, runId, error: err.message });
  }
}

const statusMessages: Record<string, string> = {
  planning: "\u{1F9D1}\u200D\u{1F4BB} Architect is analyzing the request...",
  scaffolding: "\u{1F3D7}\uFE0F Scaffolding project structure...",
  coding: "\u{1F9D1}\u200D\u{1F4BB} Developer is generating the code...",
  reviewing: "\u{1F50D} Running TS compiler and validation...",
  installing: "\u{1F4E6} Installing dependencies...",
  building: "\u{1F3D7}\uFE0F Building the project...",
  capturing_preview: "\u{1F4F8} Capturing preview...",
  ready_to_deploy: "\u2705 Build complete!",
};

async function setStatus(projectId: string, status: ProjectStatus): Promise<void> {
  await prisma.project.update({ where: { id: projectId }, data: { status } });

  bus.emit({
    type: 'project.updated',
    projectId,
    status,
    timestamp: Date.now(),
  });

  const operatorJid = process.env.BRICKOPS_OPERATOR_JID;
  const userMessage = statusMessages[status];

  if (operatorJid && userMessage) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });
      if (project) {
        deliverWhatsApp(undefined, operatorJid, `*[${project.name}]* ${userMessage}`, 'status_change', projectId);
      }
    } catch {}
  }
}

/**
 * Pipeline coordinator.
 *
 * Drives a project through the full lifecycle:
 * intake → clarification (optional) → planning → approval gate →
 * provisioning → coding → review → validation → install → build → preview
 *
 * The pipeline supports pause/resume for clarification:
 * - runPipeline() handles intake and pauses if questions exist
 * - continuePipeline() resumes after clarification answers are received
 */

export interface PipelineContext {
  projectId: string;
  runId: string;
  workspacePath?: string;
}

/**
 * Create a new Run record and return the context.
 */
async function createRun(
  projectId: string,
  initialStage: string,
): Promise<PipelineContext> {
  const run = await prisma.run.create({
    data: {
      projectId,
      currentStage: initialStage,
    },
  });

  bus.emit({
    type: 'run.started',
    runId: run.id,
    projectId,
    timestamp: Date.now(),
  });

  return { projectId, runId: run.id };
}

/**
 * Create a RunStep record for tracking.
 */
async function createStep(
  runId: string,
  name: string,
  status: string = "active",
): Promise<string> {
  const step = await prisma.runStep.create({
    data: {
      runId,
      name,
      status,
    },
  });

  // Emit step change for SSE
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: { projectId: true },
  });

  if (run) {
    bus.emit({
      type: 'run.step_changed',
      runId,
      projectId: run.projectId,
      stepName: name,
      stepStatus: status,
      timestamp: Date.now(),
    });
  }

  return step.id;
}

/**
 * Complete a RunStep.
 */
async function completeStep(
  stepId: string,
  status: "completed" | "failed" = "completed",
): Promise<void> {
  const step = await prisma.runStep.update({
    where: { id: stepId },
    data: { status, endedAt: new Date() },
  });

  const run = await prisma.run.findUnique({
    where: { id: step.runId },
    select: { projectId: true },
  });

  if (run) {
    bus.emit({
      type: 'run.step_changed',
      runId: step.runId,
      projectId: run.projectId,
      stepName: step.name,
      stepStatus: status,
      timestamp: Date.now(),
    });
  }
}

/**
 * Run the pipeline for a new project.
 * Handles intake and pauses if clarification questions exist.
 */
export async function runPipeline(projectId: string): Promise<void> {
  log("info", "Starting pipeline", { projectId });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    log("error", "Project not found", { projectId });
    return;
  }

  // If the project has workspace files and is in an active/terminal state, skip to edit mode
  const existingRun = await prisma.run.findFirst({
    where: { projectId, currentStage: { in: ['ready_to_deploy', 'deployed'] } },
    orderBy: { startedAt: 'desc' },
  });

  if (existingRun) {
    log("info", "Edit run detected — skipping to coding", { projectId });
    try {
      log("info", "Step 1: reset status", { projectId });
      try { await prisma.project.update({ where: { id: projectId }, data: { status: 'ready_to_deploy' } }); } catch {}
      
      log("info", "Step 2: createRun", { projectId });
      const ctx = await createRun(projectId, 'coding');
      
      log("info", "Step 3: safeTrans to coding", { projectId });
      try { await setStatus(projectId, 'coding'); } catch (e: any) { log("warn", "SafeTrans error", { projectId, error: e.message }); }
      
      log("info", "Step 4: continueFromCoding", { projectId, runId: ctx.runId });
      await continueFromCoding(ctx);
    } catch (err: any) {
      log("error", "Edit run failed in step", { projectId, error: err.message });
      try { await handlePipelineError(await createRun(projectId, 'failed'), projectId, err.message); } catch {}
    }
    return;
  }

  const ctx = await createRun(projectId, "intake");

  try {
    // ---- Stage 1: Intake Classification + Question Generation ----
    const intakeStepId = await createStep(ctx.runId, "Intake classification");
    await runIntake(ctx);
    await completeStep(intakeStepId);

    // Check if clarification questions were generated
    const updatedProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    // Check if there's a clarification.requested event (questions were generated)
    const clarificationThread = await prisma.projectThread.findFirst({
      where: {
        projectId,
        role: "system",
        content: { contains: '"questions"' },
      },
      orderBy: { createdAt: "desc" },
    });

    let hasQuestions = false;
    if (clarificationThread) {
      try {
        const data = JSON.parse(clarificationThread.content);
        hasQuestions = Array.isArray(data.questions) && data.questions.length > 0;
      } catch {}
    }

    if (hasQuestions) {
      // Transition to awaiting_clarification and pause
      await setStatus(projectId, "awaiting_clarification");
      log("info", "Paused — awaiting clarification", { projectId, runId: ctx.runId });

      // Store the run context for later continuation
      await prisma.projectThread.create({
        data: {
          projectId,
          role: "system",
          content: JSON.stringify({
            stage: "pipeline_paused",
            runId: ctx.runId,
            pausedAt: Date.now(),
          }),
        },
      });

      return; // Pipeline pauses here — will resume via continuePipeline()
    }

    // No questions needed — continue directly to planning
    await continueFromPlanning(ctx);
  } catch (error: any) {
    log("error", "Pipeline failed", { projectId, runId: ctx.runId, error: error.message });
    await handlePipelineError(ctx, projectId, error.message);
  }
}

/**
 * Continue the pipeline after clarification answers are received.
 * Resumes from the planning stage.
 */
export async function continuePipeline(projectId: string): Promise<void> {
  log("info", "Continuing pipeline after clarification", { projectId });

  // Find the existing run
  const pauseThread = await prisma.projectThread.findFirst({
    where: {
      projectId,
      role: "system",
      content: { contains: '"pipeline_paused"' },
    },
    orderBy: { createdAt: "desc" },
  });

  let runId: string;
  if (pauseThread) {
    try {
      const data = JSON.parse(pauseThread.content);
      runId = data.runId;
    } catch {
      // Fallback: create a new run
      const ctx = await createRun(projectId, "planning");
      runId = ctx.runId;
    }
  } else {
    const ctx = await createRun(projectId, "planning");
    runId = ctx.runId;
  }

  const ctx: PipelineContext = { projectId, runId };

  try {
    // Transition from awaiting_clarification to planning
    await setStatus(projectId, "planning");
    await continueFromPlanning(ctx);
  } catch (error: any) {
    log("error", "Pipeline continuation failed", { projectId, runId: ctx.runId, error: error.message });
    await handlePipelineError(ctx, projectId, error.message);
  }
}

/**
 * Continue from coding stage (for edit runs that skip intake/planning/approval).
 */
async function continueFromCoding(ctx: PipelineContext): Promise<void> {
  const { projectId, runId } = ctx;
  log("info", "continueFromCoding starting", { projectId, runId });

  // Provision workspace if needed
  const existingProject = await prisma.project.findUnique({ where: { id: projectId } });
  log("info", "Project found", { projectId, runId, workspacePath: existingProject?.workspacePath });
  
  if (!existingProject?.workspacePath) {
    const { WorkspaceManager } = await import("@brickops/execution");
    const wsManager = new WorkspaceManager();
    ctx.workspacePath = await wsManager.provisionWorkspace(projectId);
    await wsManager.isolateRun(ctx.workspacePath, runId);
    await prisma.project.update({ where: { id: projectId }, data: { workspacePath: ctx.workspacePath } });
  } else {
    ctx.workspacePath = existingProject.workspacePath;
  }

  // ---- Scaffold (ensure baseline files exist) ----
  const scaffoldStepId = await createStep(runId, "Project scaffolding");
  try {
    await runScaffold(ctx);
  } catch (err: any) {
    log("warn", "Scaffold failed (non-fatal)", { projectId, runId, error: err.message });
  }
  await completeStep(scaffoldStepId);

  // ---- Coding ----
  log("info", "Running coding stage", { projectId, runId });
  const codeStepId = await createStep(runId, "Code generation (edit)");
  try {
    await runCoding(ctx);
  } catch (err: any) {
    log("error", "Coding failed", { projectId, runId, error: err.message });
  }
  await completeStep(codeStepId);

  // ---- Compiler-as-Critic retry loop (max 3 attempts) ----
  const MAX_RETRIES = 3;
  let validationPassed = false;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await setStatus(projectId, "reviewing");
    const reviewStepId = await createStep(runId, `Code review ${attempt > 0 ? `(retry ${attempt})` : ''}`);
    const result = await runValidation(ctx);
    await completeStep(reviewStepId);

    if (result.pass) {
      validationPassed = true;
      break;
    }

    if (result.compilerErrors && attempt < MAX_RETRIES - 1) {
      log("info", "Compiler errors found — retrying", { projectId, runId, attempt: attempt + 1, maxRetries: MAX_RETRIES });
      const fixStepId = await createStep(runId, `Fix errors (retry ${attempt + 1})`);
      await runCoding(ctx, result.compilerErrors);
      await completeStep(fixStepId);
    } else {
      break;
    }
  }

  if (!validationPassed) {
    log("warn", "Validation did not pass after retries — continuing to build", { projectId, runId });
  }

  // ---- Install + Build ----
  await setStatus(projectId, "installing");
  const buildStepId = await createStep(runId, "Build & test");
  await runBuild(ctx);
  await setStatus(projectId, "building");
  await completeStep(buildStepId);

  // Count files and notify
  const filesCreated = await countCreatedFiles(projectId);
  const operatorJid = process.env.BRICKOPS_OPERATOR_JID;
  if (operatorJid) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, slug: true, status: true },
    });
    if (project) {
      const { templates } = await import("@brickops/notifications");
      const msg = templates.buildSuccess(project, { filesCreated, dependenciesInstalled: true });
      await deliverWhatsApp(undefined, operatorJid, msg, 'pipeline_update', projectId);
    }
  }

  await setStatus(projectId, "capturing_preview");
  await setStatus(projectId, "ready_to_deploy");

  await prisma.run.update({ where: { id: runId }, data: { currentStage: "ready_to_deploy", finishedAt: new Date() } });

  bus.emit({
    type: 'run.completed',
    runId,
    projectId,
    timestamp: Date.now(),
  });
  
  // Capture screenshot and send via WhatsApp
  await captureAndSendScreenshot(projectId, runId);
  
  log("info", "Edit run completed", { projectId, runId });
}

/**
 * Continue from planning stage through build.
 */
async function continueFromPlanning(ctx: PipelineContext): Promise<void> {
  const { projectId, runId } = ctx;

  // ---- Stage 2: Architecture Planning ----
  const planStepId = await createStep(runId, "Architecture planning");
  await runPlanning(ctx);
  await completeStep(planStepId);

  // ---- Stage 3: Await Plan Approval ----
  await setStatus(projectId, "awaiting_plan_approval");
  const approvalStepId = await createStep(
    runId,
    "Awaiting plan approval",
  );

  // Create an approval record
  const threads = await prisma.projectThread.findMany({
    where: { projectId, role: "assistant" },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  const planSummary = threads[0]?.content || "Implementation plan generated.";

  const approval = await prisma.approval.create({
    data: {
      projectId,
      title: "Implementation Plan",
      summary: planSummary.slice(0, 500),
      riskLevel: "medium",
      channel: "web",
    },
  });

  // Send approval notification directly via WhatsApp
  const operatorJid = process.env.BRICKOPS_OPERATOR_JID;
  if (operatorJid) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, slug: true, status: true },
    });
    if (project) {
      const { templates } = await import("@brickops/notifications");
      const msg = templates.planApproval(project, approval.summary, approval.riskLevel);
      await deliverWhatsApp(undefined, operatorJid, msg, 'pipeline_update', projectId);
    }
  }

  // Wait for the approval to be resolved
  await waitForApproval(approval.id, projectId);
  await completeStep(approvalStepId);

  // Check if rejected
  const resolved = await prisma.approval.findUnique({
    where: { id: approval.id },
  });
  if (resolved?.status === "rejected") {
    await setStatus(projectId, "failed");
    return;
  }

  // ---- Stage 4: Provisioning ----
  await setStatus(projectId, "provisioning_workspace");
  const provStepId = await createStep(runId, "Workspace provisioning");
  const { WorkspaceManager } = await import("@brickops/execution");
  const wsManager = new WorkspaceManager();
  ctx.workspacePath = await wsManager.provisionWorkspace(projectId);
  await wsManager.isolateRun(ctx.workspacePath, runId);
  await prisma.project.update({ where: { id: projectId }, data: { workspacePath: ctx.workspacePath } });
  await completeStep(provStepId);

  // ---- Stage 5: Indexing ----
  await setStatus(projectId, "indexing_workspace");
  const indexStepId = await createStep(runId, "Workspace indexing");
  await completeStep(indexStepId);

  // ---- Stage 5b: Scaffold (baseline project files) ----
  await setStatus(projectId, "scaffolding");
  const scaffoldStepId = await createStep(runId, "Project scaffolding");
  try {
    await runScaffold(ctx);
  } catch (err: any) {
    log("warn", "Scaffold failed (non-fatal)", { projectId, runId, error: err.message });
  }
  await completeStep(scaffoldStepId);

  // ---- Stage 6: Coding (Parallel or Sequential) ----
  await setStatus(projectId, "routing_task");
  await setStatus(projectId, "coding");

  // Check if PM produced parallel tasks
  const parallelTasksThread = await prisma.projectThread.findFirst({
    where: {
      projectId,
      role: "system",
      content: { contains: '"parallelTasks"' },
    },
    orderBy: { createdAt: "desc" },
  });

  let usedParallel = false;
  if (parallelTasksThread) {
    try {
      const data = JSON.parse(parallelTasksThread.content);
      if (data.parallelTasks && Array.isArray(data.parallelTasks) && data.parallelTasks.length > 0) {
        log("info", "Using parallel coding", { projectId, runId, agentCount: data.parallelTasks.length });
        const codeStepId = await createStep(runId, `Code generation (${data.parallelTasks.length} parallel agents)`);
        await runParallelCoding(ctx, data.parallelTasks);
        await completeStep(codeStepId);
        usedParallel = true;
      }
    } catch {}
  }

  if (!usedParallel) {
    const codeStepId = await createStep(runId, "Code generation");
    await runCoding(ctx);
    await completeStep(codeStepId);
  }

  // ---- Compiler-as-Critic retry loop (max 3 attempts) ----
  const MAX_RETRIES = 3;
  let validationPassed = false;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await setStatus(projectId, "reviewing");
    const reviewStepId = await createStep(runId, `Code review ${attempt > 0 ? `(retry ${attempt})` : ''}`);
    const result = await runValidation(ctx);
    await completeStep(reviewStepId);

    if (result.pass) {
      validationPassed = true;
      break;
    }

    if (result.compilerErrors && attempt < MAX_RETRIES - 1) {
      log("info", "Compiler errors found — retrying", { projectId, runId, attempt: attempt + 1, maxRetries: MAX_RETRIES });
      const fixStepId = await createStep(runId, `Fix errors (retry ${attempt + 1})`);
      await runCoding(ctx, result.compilerErrors);
      await completeStep(fixStepId);
    } else {
      break;
    }
  }

  if (!validationPassed) {
    log("warn", "Validation did not pass after retries — continuing to build", { projectId, runId });
  }

  // ---- Stage 8: Install + Build ----
  await setStatus(projectId, "installing");
  const buildStepId = await createStep(runId, "Build & test");
  await runBuild(ctx);
  await setStatus(projectId, "building");
  await completeStep(buildStepId);

  // Count files created for the success notification
  const filesCreated = await countCreatedFiles(projectId);

  // Send build success notification directly via WhatsApp
  if (operatorJid) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, slug: true, status: true },
    });
    if (project) {
      const { templates } = await import("@brickops/notifications");
      const msg = templates.buildSuccess(project, {
        filesCreated,
        dependenciesInstalled: true,
      });
      await deliverWhatsApp(undefined, operatorJid, msg, 'pipeline_update', projectId);
    }
  }

  // ---- Stage 9: Preview ----
  await setStatus(projectId, "capturing_preview");
  const previewStepId = await createStep(runId, "Capturing preview");
  await completeStep(previewStepId);

  // Mark ready
  await setStatus(projectId, "ready_to_deploy");

  // Mark run as completed
  await prisma.run.update({
    where: { id: runId },
    data: { currentStage: "ready_to_deploy", finishedAt: new Date() },
  });

  bus.emit({
    type: 'run.completed',
    runId,
    projectId,
    timestamp: Date.now(),
  });

  await captureAndSendScreenshot(projectId, runId);

  log("info", "Pipeline completed", { projectId, runId });
}

/**
 * Count how many files were created during coding.
 */
async function countCreatedFiles(projectId: string): Promise<number> {
  const codingThread = await prisma.projectThread.findFirst({
    where: {
      projectId,
      role: "system",
      content: { contains: '"stage":"coding"' },
    },
    orderBy: { createdAt: "desc" },
  });

  if (codingThread) {
    try {
      const data = JSON.parse(codingThread.content);
      return data.totalActions || 0;
    } catch {}
  }
  return 0;
}

/**
 * Handle pipeline errors.
 */
async function handlePipelineError(
  ctx: PipelineContext,
  projectId: string,
  errorMessage: string,
): Promise<void> {
  try {
    await setStatus(projectId, "failed");
  } catch {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "failed" },
    });
  }

  await prisma.run.update({
    where: { id: ctx.runId },
    data: {
      currentStage: "failed",
      failureReason: errorMessage,
      finishedAt: new Date(),
    },
  });

  bus.emit({
    type: 'run.failed',
    runId: ctx.runId,
    projectId,
    reason: errorMessage,
    timestamp: Date.now(),
  });

  // Send failure notification directly
  const operatorJid = process.env.BRICKOPS_OPERATOR_JID;
  if (operatorJid) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, slug: true, status: true },
    });
    if (project) {
      const { templates } = await import("@brickops/notifications");
      const msg = templates.buildFailed(project, errorMessage);
      await deliverWhatsApp(undefined, operatorJid, msg, 'pipeline_update', projectId);
    }
  }
}

/**
 * Wait for an approval to be resolved.
 * Polls the database every 2 seconds until the approval status changes.
 */
function waitForApproval(approvalId: string, projectId: string): Promise<void> {
  return new Promise((resolve) => {
    const poll = async () => {
      while (true) {
        const approval = await prisma.approval.findUnique({
          where: { id: approvalId },
          select: { status: true },
        });
        if (approval && approval.status !== 'pending') {
          resolve();
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    };
    poll();

    log("info", "Waiting for approval", { projectId, approvalId });
  });
}
