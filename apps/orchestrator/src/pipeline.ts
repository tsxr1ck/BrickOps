import { prisma } from "@brickops/db";
import type { ProjectStatus } from "@brickops/contracts";
import { runIntake } from "./stages/intake";
import { runPlanning } from "./stages/planning";
import { runCoding } from "./stages/coding";
import { runValidation } from "./stages/validate";
import { runBuild } from "./stages/build";

const GATEWAY_URL = process.env.BRICKOPS_GATEWAY_URL || "http://localhost:3002";

async function sendWhatsApp(recipientJid: string, message: string): Promise<void> {
  if (!recipientJid) return;
  try {
    await fetch(`${GATEWAY_URL}/outbound`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientJid, message }),
    });
  } catch (err) {
    console.error("[pipeline] WhatsApp send failed:", err);
  }
}

async function sendWhatsAppImage(recipientJid: string, buffer: Buffer, caption?: string): Promise<void> {
  if (!recipientJid) return;
  try {
    await fetch(`${GATEWAY_URL}/outbound-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientJid, buffer: Array.from(buffer), caption }),
    });
  } catch (err) {
    console.error("[pipeline] WhatsApp image send failed:", err);
  }
}

async function captureAndSendScreenshot(projectId: string, runId: string): Promise<void> {
  const operatorJid = process.env.BRICKOPS_OPERATOR_JID;
  if (!operatorJid) return;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, slug: true },
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
      console.warn('[pipeline] Could not start preview for screenshot');
      return;
    }

    await new Promise((r) => setTimeout(r, 1500));

    // Use the API screenshot endpoint (handles Puppeteer directly)
    const ssRes = await fetch(`${API_URL}/projects/${projectId}/screenshot`, { method: 'POST' });
    if (!ssRes.ok) {
      console.warn('[pipeline] Screenshot API failed:', ssRes.status);
      return;
    }

    const screenshotBuffer = Buffer.from(await ssRes.arrayBuffer());
    if (screenshotBuffer.length < 1000) return; // Too small, probably placeholder

    // Send via WhatsApp gateway (base64-encoded for JSON safety)
    await fetch(`${GATEWAY_URL}/outbound-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientJid: operatorJid,
        base64: screenshotBuffer.toString('base64'),
        caption: `📸 ${project.name} — Preview`,
      }),
      signal: AbortSignal.timeout(15000),
    });

    console.log(`[pipeline] Screenshot sent to WhatsApp for ${project.name}`);
  } catch (err: any) {
    console.error('[pipeline] Screenshot flow failed:', err.message);
  }
}

async function setStatus(projectId: string, status: ProjectStatus): Promise<void> {
  await prisma.project.update({ where: { id: projectId }, data: { status } });
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
    // Step change tracked in DB — no event bus needed for SSE
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
  await prisma.runStep.update({
    where: { id: stepId },
    data: { status, endedAt: new Date() },
  });
}

/**
 * Run the pipeline for a new project.
 * Handles intake and pauses if clarification questions exist.
 */
export async function runPipeline(projectId: string): Promise<void> {
  console.log(`[pipeline] Starting pipeline for project ${projectId}`);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    console.error(`[pipeline] Project ${projectId} not found`);
    return;
  }

  // If the project has workspace files and is in an active/terminal state, skip to edit mode
  const existingRun = await prisma.run.findFirst({
    where: { projectId, currentStage: { in: ['ready_to_deploy', 'deployed'] } },
    orderBy: { startedAt: 'desc' },
  });

  if (existingRun) {
    console.log(`[pipeline] Edit run detected — skipping to coding`);
    try {
      console.log('[pipeline] Step 1: reset status');
      try { await prisma.project.update({ where: { id: projectId }, data: { status: 'ready_to_deploy' } }); } catch {}
      
      console.log('[pipeline] Step 2: createRun');
      const ctx = await createRun(projectId, 'coding');
      
      console.log('[pipeline] Step 3: safeTrans to coding');
      try { await setStatus(projectId, 'coding'); } catch (e: any) { console.log('SafeTrans error:', e.message); }
      
      console.log('[pipeline] Step 4: continueFromCoding');
      await continueFromCoding(ctx);
    } catch (err: any) {
      console.error(`[pipeline] Edit run failed in step:`, err.message);
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
      console.log(`[pipeline] Paused — awaiting clarification for project ${projectId}`);

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
    console.error(
      `[pipeline] Pipeline failed for project ${projectId}:`,
      error.message,
    );
    await handlePipelineError(ctx, projectId, error.message);
  }
}

/**
 * Continue the pipeline after clarification answers are received.
 * Resumes from the planning stage.
 */
export async function continuePipeline(projectId: string): Promise<void> {
  console.log(`[pipeline] Continuing pipeline for project ${projectId} after clarification`);

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
    console.error(
      `[pipeline] Pipeline continuation failed for project ${projectId}:`,
      error.message,
    );
    await handlePipelineError(ctx, projectId, error.message);
  }
}

/**
 * Continue from coding stage (for edit runs that skip intake/planning/approval).
 */
async function continueFromCoding(ctx: PipelineContext): Promise<void> {
  const { projectId, runId } = ctx;
  console.log(`[pipeline] continueFromCoding starting for ${projectId}`);

  // Provision workspace if needed
  const existingProject = await prisma.project.findUnique({ where: { id: projectId } });
  console.log(`[pipeline] Project found, workspace: ${existingProject?.workspacePath}`);
  
  if (!existingProject?.workspacePath) {
    const { WorkspaceManager } = await import("@brickops/execution");
    const wsManager = new WorkspaceManager();
    ctx.workspacePath = await wsManager.provisionWorkspace(projectId);
    await wsManager.isolateRun(ctx.workspacePath, runId);
    await prisma.project.update({ where: { id: projectId }, data: { workspacePath: ctx.workspacePath } });
  } else {
    ctx.workspacePath = existingProject.workspacePath;
  }

  // ---- Coding ----
  console.log(`[pipeline] Running coding stage...`);
  const codeStepId = await createStep(runId, "Code generation (edit)");
  try {
    await runCoding(ctx);
  } catch (err: any) {
    console.error(`[pipeline] Coding failed: ${err.message}`);
  }
  await completeStep(codeStepId);

  // ---- Review ----
  await setStatus(projectId, "reviewing");
  const reviewStepId = await createStep(runId, "Code review");
  await runValidation(ctx);
  await completeStep(reviewStepId);

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
      await sendWhatsApp(operatorJid, msg);
    }
  }

  await setStatus(projectId, "capturing_preview");
  await setStatus(projectId, "ready_to_deploy");

  await prisma.run.update({ where: { id: runId }, data: { currentStage: "ready_to_deploy", finishedAt: new Date() } });
  
  // Capture screenshot and send via WhatsApp
  await captureAndSendScreenshot(projectId, runId);
  
  console.log(`[pipeline] Edit run completed for project ${projectId}`);
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
      await sendWhatsApp(operatorJid, msg);
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

  // ---- Stage 6: Coding ----
  await setStatus(projectId, "routing_task");
  await setStatus(projectId, "coding");
  const codeStepId = await createStep(runId, "Code generation");
  await runCoding(ctx);
  await completeStep(codeStepId);

  // ---- Stage 7: Review ----
  await setStatus(projectId, "reviewing");
  const reviewStepId = await createStep(runId, "Code review");
  await runValidation(ctx);
  await completeStep(reviewStepId);

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
      await sendWhatsApp(operatorJid, msg);
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

  await captureAndSendScreenshot(projectId, runId);

  console.log(`[pipeline] Pipeline completed for project ${projectId}`);
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

  await prisma.run.update({
    where: { id: ctx.runId },
    data: {
      currentStage: "failed",
      failureReason: errorMessage,
      finishedAt: new Date(),
    },
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
      await sendWhatsApp(operatorJid, msg);
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

    console.log(
      `[pipeline] Waiting for approval ${approvalId} on project ${projectId}...`,
    );
  });
}
