import { z } from 'zod';

/**
 * Orchestrator state types.
 *
 * These define the full lifecycle of a project through the BrickOps pipeline.
 * The state machine in apps/orchestrator enforces valid transitions.
 */

export const PROJECT_STATUSES = [
  'draft',
  'awaiting_clarification',
  'planning',
  'awaiting_plan_approval',
  'provisioning_workspace',
  'indexing_workspace',
  'routing_task',
  'coding',
  'reviewing',
  'awaiting_approval',
  'installing',
  'testing',
  'building',
  'capturing_preview',
  'awaiting_user_feedback',
  'ready_to_deploy',
  'deploying',
  'deployed',
  'failed',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type RunState = ProjectStatus;

/** States that indicate the project is actively processing (no human action needed). */
export const ACTIVE_STATES: readonly ProjectStatus[] = [
  'planning',
  'provisioning_workspace',
  'indexing_workspace',
  'routing_task',
  'coding',
  'reviewing',
  'installing',
  'testing',
  'building',
  'capturing_preview',
  'deploying',
];

/** States that block until the operator acts. */
export const WAITING_STATES: readonly ProjectStatus[] = [
  'awaiting_clarification',
  'awaiting_plan_approval',
  'awaiting_approval',
  'awaiting_user_feedback',
  'ready_to_deploy',
];

/** Terminal states. */
export const TERMINAL_STATES: readonly ProjectStatus[] = [
  'deployed',
  'failed',
];

// --- API input/output schemas ---

export const CreateProjectInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(5000),
  source: z.enum(['web', 'whatsapp', 'imported']).default('web'),
  repoUrl: z.string().url().optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const UpdateProjectInput = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  repoUrl: z.string().url().nullable().optional(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>;

export const ApprovalAction = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().optional(),
});

export type ApprovalAction = z.infer<typeof ApprovalAction>;

// --- SSE event types ---

export type SSEEventType =
  | 'run.step'
  | 'project.update'
  | 'approval.new'
  | 'approval.resolved'
  | 'notification'
  | 'heartbeat';

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, any>;
  timestamp: number;
}
