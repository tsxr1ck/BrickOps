/**
 * Stub for @brickops/contracts package.
 */

import { z } from 'zod';

// Validation schemas
export const CreateProjectInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(10000),
  source: z.enum(['web', 'whatsapp', 'imported']),
  repoUrl: z.string().url().optional(),
});

export const UpdateProjectInput = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['draft', 'coding', 'awaiting_clarification', 'ready_to_deploy', 'deployed']).optional(),
  source: z.enum(['web', 'whatsapp', 'imported']).optional(),
  workspacePath: z.string().optional(),
  repoUrl: z.string().url().nullable().optional(),
});

export const ApprovalAction = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().optional(),
});

// SSE types
export type SSEEventType =
  | 'heartbeat'
  | 'project.created'
  | 'project.updated'
  | 'project.update'
  | 'run.step'
  | 'approval.new'
  | 'approval.resolved'
  | 'notification'
  | 'session.run';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: number;
}
