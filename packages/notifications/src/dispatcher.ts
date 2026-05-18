import { bus } from '@brickops/events';
import type {
  ApprovalRequestedEvent,
  RunFailedEvent,
  ProjectCreatedEvent,
  ApprovalResolvedEvent,
  ClarificationRequestedEvent,
  PlanGeneratedEvent,
  BuildCompletedEvent,
} from '@brickops/events';
import * as templates from './templates';
import type { ProjectInfo } from './templates';
import { generatePlanPdf, getPlanFilename } from './pdf';

/**
 * Notification dispatcher.
 *
 * Listens to the event bus and sends formatted messages to the WhatsApp
 * gateway via HTTP (cross-process) or emits notification.send events
 * on the bus (in-process fallback).
 */

/** Resolve project info for templates. In production this queries the DB. */
type ProjectResolver = (projectId: string) => Promise<ProjectInfo | null>;

/** Resolve operator JID for WhatsApp delivery. */
type OperatorResolver = () => Promise<string | null>;

const GATEWAY_URL = process.env.BRICKOPS_GATEWAY_URL || 'http://localhost:3002';

export async function deliverWhatsApp(
  gatewayUrl: string | undefined,
  recipientJid: string,
  message: string,
  notificationType: string,
  projectId?: string
): Promise<void> {
  const url = gatewayUrl || GATEWAY_URL;
  try {
    await fetch(`${url}/outbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientJid, message }),
    });
  } catch (err) {
    console.error(`[notifications] Failed to deliver to gateway:`, err);
  }
}

export async function deliverWhatsAppDocument(
  gatewayUrl: string | undefined,
  recipientJid: string,
  buffer: Buffer,
  filename: string,
  caption?: string
): Promise<void> {
  const url = gatewayUrl || GATEWAY_URL;
  try {
    await fetch(`${url}/outbound-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientJid,
        buffer: Array.from(buffer),
        filename,
        caption,
      }),
    });
  } catch (err) {
    console.error(`[notifications] Failed to deliver document to gateway:`, err);
  }
}

export function setupNotificationDispatcher(
  resolveProject: ProjectResolver,
  resolveOperator: OperatorResolver,
  gatewayUrl?: string
): void {
  // --- Approval requested → send approval card ---
  bus.on('approval.requested', async (event: ApprovalRequestedEvent) => {
    const project = await resolveProject(event.projectId);
    const operatorJid = await resolveOperator();
    if (!project || !operatorJid) return;

    const message = templates.planApproval(project, event.summary, event.riskLevel);
    await deliverWhatsApp(gatewayUrl, operatorJid, message, 'approval_request', event.projectId);
  });

  // --- Run failed → send failure notification ---
  bus.on('run.failed', async (event: RunFailedEvent) => {
    const project = await resolveProject(event.projectId);
    const operatorJid = await resolveOperator();
    if (!project || !operatorJid) return;

    const message = templates.buildFailed(project, event.reason);
    await deliverWhatsApp(gatewayUrl, operatorJid, message, 'build_failed', event.projectId);
  });

  // --- Project created → send confirmation ---
  bus.on('project.created', async (event: ProjectCreatedEvent) => {
    const project = await resolveProject(event.projectId);
    const operatorJid = await resolveOperator();
    if (!project || !operatorJid) return;

    const message = templates.projectCreated(project);
    await deliverWhatsApp(gatewayUrl, operatorJid, message, 'project_created', event.projectId);
  });

  // --- Approval resolved → send confirmation ---
  bus.on('approval.resolved', async (event: ApprovalResolvedEvent) => {
    const project = await resolveProject(event.projectId);
    const operatorJid = await resolveOperator();
    if (!project || !operatorJid) return;

    const message = templates.approvalResolved(project, event.decision);
    await deliverWhatsApp(gatewayUrl, operatorJid, message, 'approval_resolved', event.projectId);
  });

  // --- Clarification requested → send questions via WhatsApp ---
  bus.on('clarification.requested', async (event: ClarificationRequestedEvent) => {
    console.log(`[notifications] Received clarification.requested for project ${event.projectId}`);
    const project = await resolveProject(event.projectId);
    const operatorJid = await resolveOperator();
    console.log(`[notifications] Project:`, project, `Operator:`, operatorJid);
    if (!project || !operatorJid) {
      console.warn('[notifications] Missing project or operator — skipping clarification notification');
      return;
    }

    const message = templates.clarificationQuestions(project, event.questions);
    await deliverWhatsApp(gatewayUrl, operatorJid, message, 'clarification_request', event.projectId);

    // Register the conversation state in the gateway
    try {
      await fetch(`${gatewayUrl || GATEWAY_URL}/clarification/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorJid,
          projectId: event.projectId,
          projectSlug: project.slug,
          projectName: project.name,
          questions: event.questions,
        }),
      });
    } catch (err) {
      console.error('[notifications] Failed to register clarification state:', err);
    }
  });

  // --- Plan generated → send summary + PDF via WhatsApp ---
  bus.on('plan.generated', async (event: PlanGeneratedEvent) => {
    const project = await resolveProject(event.projectId);
    const operatorJid = await resolveOperator();
    if (!project || !operatorJid) return;

    // Extract key info from the plan for the compact summary
    const planInfo = extractPlanInfo(event.plan);

    // Send compact summary
    const summaryMessage = templates.planSummary(project, planInfo);
    await deliverWhatsApp(gatewayUrl, operatorJid, summaryMessage, 'plan_summary', event.projectId);

    // Generate and send PDF
    try {
      const pdfBuffer = await generatePlanPdf(event.plan, project.name);
      const filename = getPlanFilename(project.slug);
      await deliverWhatsAppDocument(gatewayUrl, operatorJid, pdfBuffer, filename, `Implementation plan for ${project.name}`);
    } catch (err) {
      console.error('[notifications] Failed to generate/send PDF:', err);
    }
  });

  // --- Build completed → send success notification ---
  bus.on('build.completed', async (event: BuildCompletedEvent) => {
    const project = await resolveProject(event.projectId);
    const operatorJid = await resolveOperator();
    if (!project || !operatorJid) return;

    const message = templates.buildSuccess(project, {
      filesCreated: event.filesCreated,
      dependenciesInstalled: true,
    });
    await deliverWhatsApp(gatewayUrl, operatorJid, message, 'build_success', event.projectId);
  });
}

/**
 * Extract key information from a plan markdown for the compact summary.
 */
function extractPlanInfo(plan: string): {
  projectType: string;
  stack: string[];
  milestoneCount: number;
  milestones: string[];
  moduleCount: number;
} {
  const lines = plan.split('\n');

  // Extract project type
  let projectType = 'fullstack';
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('project type:')) {
      projectType = line.split(':')[1]?.trim() || projectType;
      break;
    }
    if (lower.includes('frontend') || lower.includes('spa')) projectType = 'Frontend SPA';
    if (lower.includes('fullstack') || lower.includes('full-stack')) projectType = 'Fullstack';
    if (lower.includes('api') && lower.includes('only')) projectType = 'API';
  }

  // Extract stack
  const stack: string[] = [];
  const stackKeywords = ['react', 'vue', 'angular', 'svelte', 'next', 'nuxt', 'hono', 'express', 'fastify', 'bun', 'node', 'typescript', 'javascript', 'prisma', 'drizzle', 'postgres', 'mysql', 'mongo', 'redis', 'tailwind', 'css'];
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const kw of stackKeywords) {
      if (lower.includes(kw) && !stack.includes(kw)) {
        stack.push(kw.charAt(0).toUpperCase() + kw.slice(1));
      }
    }
  }

  // Extract milestones
  const milestones: string[] = [];
  let inMilestones = false;
  for (const line of lines) {
    if (line.toLowerCase().includes('milestone')) {
      inMilestones = true;
      continue;
    }
    if (inMilestones) {
      const match = line.match(/^\d+\.\s+(.+)/);
      if (match) {
        milestones.push(match[1].trim());
      } else if (line.startsWith('#') || line.startsWith('##')) {
        break;
      }
    }
  }

  // Count modules (rough estimate from ## headings)
  const moduleCount = lines.filter((l) => l.startsWith('## ')).length || 3;

  return {
    projectType,
    stack: stack.slice(0, 5),
    milestoneCount: milestones.length || 5,
    milestones: milestones.length > 0 ? milestones : ['Scaffold', 'Core features', 'Testing', 'Build', 'Deploy'],
    moduleCount,
  };
}
