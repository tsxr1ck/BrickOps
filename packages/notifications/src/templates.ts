/**
 * Operator-facing notification templates.
 *
 * These produce compact, operator-oriented messages optimized for
 * WhatsApp reading. As the blueprint says: "compact and operator-oriented"
 * with links back to the web UI rather than dumping large blobs.
 */

export interface ProjectInfo {
  name: string;
  slug: string;
  status: string;
}

const WEB_BASE = process.env.BRICKOPS_WEB_URL || 'http://localhost:5173';

/**
 * Project selected confirmation.
 */
export function projectSelected(project: ProjectInfo): string {
  return [
    `📌 *Project Selected*`,
    `Now focused on: ${project.name}`,
    `Status: ${project.status}`,
    '',
    `All commands now target this project by default.`,
    `Reply "deselect" to clear.`,
    `${WEB_BASE}/projects/${project.slug}`,
  ].join('\n');
}

/**
 * Project deselected confirmation.
 */
export function projectDeselected(): string {
  return [
    `📌 *Selection Cleared*`,
    `No project is currently selected.`,
    `Specify a project name in your commands, or reply "select [project]" to set one.`,
  ].join('\n');
}

/**
 * Plan needs approval.
 */
export function planApproval(
  project: ProjectInfo,
  summary: string,
  riskLevel: string
): string {
  const risk = riskLevel === 'high' || riskLevel === 'critical' ? `⚠️ Risk: ${riskLevel.toUpperCase()}` : '';
  return [
    `📋 *Plan Ready*`,
    `Project: ${project.name}`,
    `State: awaiting_plan_approval`,
    '',
    summary,
    '',
    risk,
    `Details: ${WEB_BASE}/projects/${project.slug}`,
    '',
    `Reply: APPROVE ${project.slug}`,
    `Reply: REJECT ${project.slug}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Build failed notification.
 */
export function buildFailed(project: ProjectInfo, reason: string): string {
  return [
    `❌ *Build Failed*`,
    `Project: ${project.name}`,
    '',
    `Reason: ${reason}`,
    '',
    `Logs: ${WEB_BASE}/projects/${project.slug}`,
  ].join('\n');
}

/**
 * Preview is ready.
 */
export function previewReady(project: ProjectInfo, previewUrl: string): string {
  return [
    `✅ *Preview Ready*`,
    `Project: ${project.name}`,
    '',
    `Preview: ${previewUrl}`,
    `Details: ${WEB_BASE}/projects/${project.slug}`,
  ].join('\n');
}

/**
 * Project status summary — response to "status of X".
 */
export function statusSummary(
  project: ProjectInfo,
  lastAction?: string
): string {
  return [
    `📊 *${project.name}*`,
    `Status: ${project.status}`,
    lastAction ? `Last: ${lastAction}` : '',
    '',
    `${WEB_BASE}/projects/${project.slug}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Project created confirmation.
 */
export function projectCreated(project: ProjectInfo): string {
  return [
    `🚀 *Project Created*`,
    `Name: ${project.name}`,
    `Slug: ${project.slug}`,
    '',
    `Planning will begin shortly.`,
    `${WEB_BASE}/projects/${project.slug}`,
  ].join('\n');
}

/**
 * Approval resolved (approved or rejected).
 */
export function approvalResolved(
  project: ProjectInfo,
  decision: 'approved' | 'rejected'
): string {
  const emoji = decision === 'approved' ? '✅' : '🚫';
  return [
    `${emoji} *${decision === 'approved' ? 'Approved' : 'Rejected'}*`,
    `Project: ${project.name}`,
    '',
    decision === 'approved'
      ? 'Build will proceed.'
      : 'The plan has been rejected. Send a new request when ready.',
  ].join('\n');
}

/**
 * Project list response.
 */
export function projectList(
  projects: Array<{ name: string; status: string; slug?: string }>,
  selectedSlug?: string
): string {
  if (projects.length === 0) {
    return '📂 No projects found.';
  }
  const lines = projects.map(
    (p, i) => `${i + 1}. *${p.name}* — ${p.status}${p.slug && p.slug === selectedSlug ? ' 📌' : ''}`
  );
  return [`📂 *Your Projects* (${projects.length})`, '', ...lines].join('\n');
}

/**
 * Generic info response (for "what files changed?", "show blockers", etc).
 */
export function infoResponse(project: ProjectInfo, info: string): string {
  return [
    `ℹ️ *${project.name}*`,
    '',
    info,
    '',
    `${WEB_BASE}/projects/${project.slug}`,
  ].join('\n');
}

/**
 * User input needed.
 */
export function inputNeeded(project: ProjectInfo, question: string): string {
  return [
    `❓ *Input Needed*`,
    `Project: ${project.name}`,
    '',
    question,
  ].join('\n');
}

/**
 * Clarification questions — sent after project creation.
 * Lists numbered questions for the operator to answer.
 */
export function clarificationQuestions(
  project: ProjectInfo,
  questions: string[]
): string {
  const numbered = questions.map((q, i) => `${i + 1}. ${q}`);
  return [
    `❓ *A few questions before I plan*`,
    `Project: ${project.name}`,
    '',
    ...numbered,
    '',
    `Reply with answers (one per line or all at once).`,
  ].join('\n');
}

/**
 * Compact plan summary for WhatsApp.
 * Shows key info without dumping the full plan.
 */
export function planSummary(
  project: ProjectInfo,
  info: {
    projectType: string;
    stack: string[];
    milestoneCount: number;
    milestones: string[];
    moduleCount: number;
  }
): string {
  const stackStr = info.stack.slice(0, 4).join(', ');
  const milestoneStr = info.milestones
    .slice(0, 5)
    .map((m, i) => `${i + 1}. ${m}`)
    .join('\n');

  return [
    `📋 *Implementation Plan Ready*`,
    `Project: ${project.name}`,
    '',
    `*Type:* ${info.projectType}`,
    `*Stack:* ${stackStr}`,
    `*Modules:* ${info.moduleCount} planned`,
    `*Milestones:*`,
    milestoneStr,
    '',
    `📄 Full plan attached as PDF.`,
    `🌐 ${WEB_BASE}/projects/${project.slug}`,
    '',
    `Reply: APPROVE ${project.slug}`,
    `Reply: REJECT ${project.slug}`,
  ].join('\n');
}

/**
 * Build successful — project is ready.
 */
export function buildSuccess(
  project: ProjectInfo,
  info: {
    filesCreated: number;
    dependenciesInstalled: boolean;
  }
): string {
  return [
    `✅ *Build Successful*`,
    `Project: ${project.name}`,
    `Status: ready_to_deploy`,
    '',
    `Files created: ${info.filesCreated}`,
    `Dependencies: ${info.dependenciesInstalled ? '✓ installed' : '⚠ check manually'}`,
    `Build: ✓ passed`,
    '',
    `🌐 ${WEB_BASE}/projects/${project.slug}`,
    `Reply: DEPLOY ${project.slug} to publish`,
  ].join('\n');
}
