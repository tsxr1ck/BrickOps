import type { ToolCall, TokenUsage, FinishReason, Message } from './messages';

export type ProviderEvent =
  | { type: 'thinking_delta'; content: string }
  | { type: 'content_delta'; content: string }
  | { type: 'tool_use_start'; toolCall: ToolCall }
  | { type: 'tool_use_stop'; toolCallId: string }
  | { type: 'error'; error: Error }
  | {
      type: 'complete';
      response: {
        toolCalls: ToolCall[];
        finishReason: FinishReason;
        usage: TokenUsage;
      };
    };

export interface ModelInfo {
  id: string;
  provider: string;
  maxTokens: number;
  supportsThinking: boolean;
}

export interface Provider {
  model(): ModelInfo;
  streamResponse(
    messages: Message[],
    tools?: Tool[]
  ): AsyncIterable<ProviderEvent>;
  sendMessages(
    messages: Message[],
    tools?: Tool[]
  ): Promise<{
    content: string;
    toolCalls: ToolCall[];
    usage: TokenUsage;
    finishReason: FinishReason;
  }>;
}

export interface ToolContext {
  sessionId: string;
  messageId: string;
  abortSignal?: AbortSignal;
}

export interface ToolCallInput {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolRunResult {
  content: string;
  metadata?: any;
  isError?: boolean;
}

export interface Tool {
  info(): { name: string; description: string; schema?: any };
  run(ctx: ToolContext, call: ToolCallInput): Promise<ToolRunResult>;
}
