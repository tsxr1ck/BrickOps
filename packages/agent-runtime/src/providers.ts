import type { ProviderConfig, AgentResponse, PromptMessage, ModelTier } from '@brickops/contracts';

/**
 * Provider adapter interface.
 * Both OpenAI and Anthropic implement this so the runtime
 * can swap between them transparently.
 */
export interface ProviderAdapter {
  name: string;
  chat(
    model: string,
    messages: PromptMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<AgentResponse>;
}

/**
 * OpenAI-compatible provider adapter.
 * Works with OpenAI, OpenRouter, and any OpenAI-compatible API.
 *
 * Prompt caching strategy: OpenAI caches automatically when the leading
 * tokens of the prompt are identical across requests. We exploit this
 * by placing stable persona + rules blocks first.
 */
export class OpenAIAdapter implements ProviderAdapter {
  name = 'openai';
  private apiKey: string;
  private baseUrl: string;
  private models: Record<ModelTier, string>;

  constructor(config: ProviderConfig & { baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.models = config.models;
  }

  getModel(tier: ModelTier): string {
    return this.models[tier];
  }

  async chat(
    model: string,
    messages: PromptMessage[],
    options: { maxTokens?: number; temperature?: number } = {}
  ): Promise<AgentResponse> {
    const start = Date.now();

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.3,
      }),
      signal: AbortSignal.timeout(300000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens || 0,
      },
      model: data.model || model,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Anthropic provider adapter.
 *
 * Prompt caching strategy: Anthropic supports explicit cache_control
 * markers on message blocks. We mark the persona and rules blocks
 * as cacheable so repeated specialist invocations hit the cache.
 */
export class AnthropicAdapter implements ProviderAdapter {
  name = 'anthropic';
  private apiKey: string;
  private models: Record<ModelTier, string>;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.models = config.models;
  }

  getModel(tier: ModelTier): string {
    return this.models[tier];
  }

  async chat(
    model: string,
    messages: PromptMessage[],
    options: { maxTokens?: number; temperature?: number } = {}
  ): Promise<AgentResponse> {
    const start = Date.now();

    // Separate system messages from conversation messages
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Build Anthropic system blocks with cache_control hints
    const systemBlocks = systemMessages.map((m) => ({
      type: 'text' as const,
      text: m.content,
      ...(m.cacheable ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.3,
        system: systemBlocks,
        messages: conversationMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as any;

    return {
      content: data.content?.[0]?.text || '',
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        cachedTokens: data.usage?.cache_read_input_tokens || 0,
      },
      model: data.model || model,
      durationMs: Date.now() - start,
    };
  }
}
