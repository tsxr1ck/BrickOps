import { AgentExecutor, OpenAIAdapter } from '@brickops/agent-runtime';

/**
 * AI singleton for the WhatsApp gateway.
 *
 * Uses the same provider config as the orchestrator.
 * Only the cheap model is used for intent parsing —
 * we never need mid/strong for classification.
 */

let executor: AgentExecutor | null = null;

export function getExecutor(): AgentExecutor {
  if (executor) return executor;

  executor = new AgentExecutor();

  executor.registerProvider(
    new OpenAIAdapter({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://opencode.ai/zen/go/v1',
      models: {
        cheap: 'deepseek-v4-flash',
        mid: 'deepseek-v4-pro',
        strong: 'mimo-v2.5-pro',
      },
    }),
    true
  );

  return executor;
}
