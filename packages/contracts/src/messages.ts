export type MessageRole = 'user' | 'assistant' | 'tool' | 'system';

export type FinishReason =
  | 'end_turn'
  | 'tool_use'
  | 'canceled'
  | 'permission_denied'
  | 'error'
  | 'max_tokens'
  | 'stop';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolResultContent {
  type: 'tool_result';
  toolCallId: string;
  content: string;
  metadata?: any;
  isError?: boolean;
}

export interface FinishContent {
  type: 'finish';
  reason: FinishReason;
  time: number;
}

export interface BinaryContent {
  type: 'binary';
  path: string;
  mimeType: string;
  data?: Uint8Array;
}

export type ContentPart = TextContent | ToolResultContent | FinishContent | BinaryContent;

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  status: 'pending' | 'running' | 'completed' | 'error';
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  metadata?: any;
  isError: boolean;
}

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  parts: ContentPart[];
  modelId?: string;
  toolCalls?: ToolCall[];
  reasoningContent?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: string;
  title?: string;
  summaryMessageId?: string;
  cost: number;
  promptTokens: number;
  completionTokens: number;
  createdAt: number;
  updatedAt: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}
