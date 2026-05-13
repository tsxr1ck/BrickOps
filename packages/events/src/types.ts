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
  | BuildCompletedEvent;

/** Extract the event type string literals for type-safe subscriptions. */
export type SystemEventType = SystemEvent['type'];

/** Get the event shape for a specific event type. */
export type EventOfType<T extends SystemEventType> = Extract<
  SystemEvent,
  { type: T }
>;
