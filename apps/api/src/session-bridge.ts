import path from 'path';
import { SessionService, MessageService } from '@brickops/db';
import { createWorkspaceTools, OpenAIStreamingProvider } from '@brickops/agent-runtime';

/**
 * Creates a streaming provider (OpenAI) wired to emit LLM deltas to the event bus.
 */
export function createProvider() {
  return new OpenAIStreamingProvider({
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://opencode.ai/zen/go/v1',
    modelId: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
  });
}

/**
 * Creates workspace tools.
 */
export function createTools() {
  const root = process.env.WORKSPACE_ROOT || path.resolve(process.cwd());
  return createWorkspaceTools(root);
}

/**
 * Creates a SessionService that persists via DB.
 */
export function createSessionService(_sessionId: string) {
  return new SessionService();
}

/**
 * Creates an in-memory MessageService.
 */
export function createMessageService(_sessionId: string) {
  return new MessageService();
}
