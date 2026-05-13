import { AgentExecutor, OpenAIAdapter } from '@brickops/agent-runtime';

export const executor = new AgentExecutor();

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
