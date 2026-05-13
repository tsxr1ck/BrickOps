import { z } from 'zod';

/**
 * WhatsApp intent schemas.
 *
 * These define the structured intents that the gateway's parser
 * extracts from raw inbound messages. The discriminated union
 * lets the handler switch on `intent.type` with full type safety.
 */

// --- Intent types ---

export const CreateProjectIntent = z.object({
  type: z.literal('create_project'),
  description: z.string(),
});

export const ListProjectsIntent = z.object({
  type: z.literal('list_projects'),
});

export const ProjectStatusIntent = z.object({
  type: z.literal('project_status'),
  projectQuery: z.string(), // name, slug, or partial match
});

export const ApproveIntent = z.object({
  type: z.literal('approve'),
  projectQuery: z.string().optional(), // optional — approves latest if omitted
});

export const RejectIntent = z.object({
  type: z.literal('reject'),
  projectQuery: z.string().optional(),
  reason: z.string().optional(),
});

export const InfoRequestIntent = z.object({
  type: z.literal('info_request'),
  query: z.string(),
  projectQuery: z.string().optional(),
});

export const ClarificationAnswerIntent = z.object({
  type: z.literal('clarification_answer'),
  answer: z.string(),
  projectQuery: z.string().optional(),
});

export const ChatIntent = z.object({
  type: z.literal('chat'),
  message: z.string(),
});

export const ModifyProjectIntent = z.object({
  type: z.literal('modify_project'),
  projectQuery: z.string(),
  request: z.string(),
});

export const UnknownIntent = z.object({
  type: z.literal('unknown'),
  rawText: z.string(),
});

export const WhatsAppIntent = z.discriminatedUnion('type', [
  CreateProjectIntent,
  ListProjectsIntent,
  ProjectStatusIntent,
  ApproveIntent,
  RejectIntent,
  InfoRequestIntent,
  ClarificationAnswerIntent,
  ModifyProjectIntent,
  ChatIntent,
  UnknownIntent,
]);

export type WhatsAppIntent = z.infer<typeof WhatsAppIntent>;

// --- Inbound/Outbound message shapes ---

export const WhatsAppInbound = z.object({
  sender: z.string(), // JID
  senderName: z.string().optional(),
  text: z.string(),
  timestamp: z.number(),
  messageId: z.string(),
});

export type WhatsAppInbound = z.infer<typeof WhatsAppInbound>;

export const WhatsAppOutbound = z.object({
  recipient: z.string(), // JID
  text: z.string(),
  replyTo: z.string().optional(), // quote a message
});

export type WhatsAppOutbound = z.infer<typeof WhatsAppOutbound>;
