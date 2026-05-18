/**
 * System event types.
 *
 * Every event that flows through the BrickOps event bus is defined here
 * as a discriminated union on the `type` field. This keeps all inter-service
 * communication type-safe and self-documenting.
 */

export interface ProjectCreatedEvent {
  type: 'project.created';
  projectId: string;
  name: string;
  source: 'web' | 'whatsapp' | 'imported';
  timestamp: number;
}

export interface ProjectUpdatedEvent {
  type: 'project.updated';
  projectId: string;
  status: string;
  timestamp: number;
}

export interface RunStartedEvent {
  type: 'run.started';
  runId: string;
  projectId: string;
  timestamp: number;
}

export interface RunStepChangedEvent {
  type: 'run.step_changed';
  runId: string;
  projectId: string;
  stepName: string;
  stepStatus: string;
  timestamp: number;
}

export interface RunCompletedEvent {
  type: 'run.completed';
  runId: string;
  projectId: string;
  timestamp: number;
}

export interface RunFailedEvent {
  type: 'run.failed';
  runId: string;
  projectId: string;
  reason: string;
  timestamp: number;
}

export interface ApprovalRequestedEvent {
  type: 'approval.requested';
  approvalId: string;
  projectId: string;
  title: string;
  summary: string;
  riskLevel: string;
  timestamp: number;
}

export interface ApprovalResolvedEvent {
  type: 'approval.resolved';
  approvalId: string;
  projectId: string;
  decision: 'approved' | 'rejected';
  timestamp: number;
}

export interface NotificationSendEvent {
  type: 'notification.send';
  channel: 'web' | 'whatsapp';
  notificationType: string;
  message: string;
  recipientJid?: string;
  projectId?: string;
  timestamp: number;
}

export interface WhatsAppInboundEvent {
  type: 'whatsapp.inbound';
  sender: string;
  senderName?: string;
  text: string;
  messageId: string;
  timestamp: number;
}

export interface WhatsAppOutboundEvent {
  type: 'whatsapp.outbound';
  recipient: string;
  text: string;
  replyTo?: string;
  timestamp: number;
}

export interface WhatsAppStateEvent {
  type: 'whatsapp.state';
  state: 'disconnected' | 'connecting' | 'open';
  timestamp: number;
}

export interface WhatsAppReconnectEvent {
  type: 'whatsapp.reconnect';
  timestamp: number;
}

export interface ClarificationRequestedEvent {
  type: 'clarification.requested';
  projectId: string;
  questions: string[];
  timestamp: number;
}

export interface ClarificationAnsweredEvent {
  type: 'clarification.answered';
  projectId: string;
  answers: string[];
  timestamp: number;
}

export interface PlanGeneratedEvent {
  type: 'plan.generated';
  projectId: string;
  plan: string;
  timestamp: number;
}

// ── Phase 1: Agent loop granular events ──

export interface SessionRunStartedEvent {
  type: 'session.run_started';
  sessionId: string;
  projectId: string;
  runId: string;
  prompt: string;
  timestamp: number;
}

export interface LLMThinkingDeltaEvent {
  type: 'llm_thinking_delta';
  sessionId: string;
  runId: string;
  content: string;
  timestamp: number;
}

export interface LLMContentDeltaEvent {
  type: 'llm_content_delta';
  sessionId: string;
  runId: string;
  content: string;
  timestamp: number;
}

export interface ToolStartedEvent {
  type: 'tool_started';
  sessionId: string;
  runId: string;
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  timestamp: number;
}

export interface ToolFinishedEvent {
  type: 'tool_finished';
  sessionId: string;
  runId: string;
  toolName: string;
  toolCallId: string;
  result: string;
  isError: boolean;
  timestamp: number;
}

export interface FileWrittenEvent {
  type: 'file_written';
  sessionId: string;
  runId: string;
  filePath: string;
  timestamp: number;
}

export interface FileReadEvent {
  type: 'file_read';
  sessionId: string;
  runId: string;
  filePath: string;
  timestamp: number;
}

export interface DiffAppliedEvent {
  type: 'diff_applied';
  sessionId: string;
  runId: string;
  filePath: string;
  timestamp: number;
}

export interface TestsStartedEvent {
  type: 'tests_started';
  sessionId: string;
  runId: string;
  command: string;
  timestamp: number;
}

export interface TestsFinishedEvent {
  type: 'tests_finished';
  sessionId: string;
  runId: string;
  passed: number;
  failed: number;
  output: string;
  timestamp: number;
}

export interface SessionErrorEvent {
  type: 'session.error';
  sessionId: string;
  runId: string;
  message: string;
  timestamp: number;
}

export interface SessionRunCompletedEvent {
  type: 'session.run_completed';
  sessionId: string;
  projectId: string;
  runId: string;
  summary: string;
  timestamp: number;
}

export interface BuildCompletedEvent {
  type: 'build.completed';
  projectId: string;
  runId: string;
  filesCreated: number;
  timestamp: number;
}

export type SystemEvent =
  | ProjectCreatedEvent
  | ProjectUpdatedEvent
  | RunStartedEvent
  | RunStepChangedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | ApprovalRequestedEvent
  | ApprovalResolvedEvent
  | NotificationSendEvent
  | WhatsAppInboundEvent
  | WhatsAppOutboundEvent
  | WhatsAppStateEvent
  | WhatsAppReconnectEvent
  | ClarificationRequestedEvent
  | ClarificationAnsweredEvent
  | PlanGeneratedEvent
  | BuildCompletedEvent
  | SessionRunStartedEvent
  | LLMThinkingDeltaEvent
  | LLMContentDeltaEvent
  | ToolStartedEvent
  | ToolFinishedEvent
  | FileWrittenEvent
  | FileReadEvent
  | DiffAppliedEvent
  | TestsStartedEvent
  | TestsFinishedEvent
  | SessionErrorEvent
  | SessionRunCompletedEvent;

/** Extract the event type string literals for type-safe subscriptions. */
export type SystemEventType = SystemEvent['type'];

/** Get the event shape for a specific event type. */
export type EventOfType<T extends SystemEventType> = Extract<
  SystemEvent,
  { type: T }
>;
