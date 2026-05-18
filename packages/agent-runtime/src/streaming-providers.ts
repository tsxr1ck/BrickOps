import type {
  Provider,
  ProviderEvent,
  Message,
  ToolCall,
  TokenUsage,
  FinishReason,
  ModelInfo,
  Tool,
} from '@brickops/contracts';

/**
 * Parse an OpenAI streaming SSE response into ProviderEvents.
 */
async function* parseOpenAIStream(
  body: ReadableStream<Uint8Array> | null,
  signal?: AbortSignal
): AsyncGenerator<ProviderEvent> {
  if (!body) {
    yield { type: 'error', error: new Error('No response body') };
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const toolCallMap = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        const jsonStr = trimmed.slice(6);
        let data: any;
        try {
          data = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        const choices = data.choices;
        if (!choices || choices.length === 0) continue;

        const delta = choices[0].delta;
        if (!delta) continue;

        if (delta.reasoning || delta.reasoning_content) {
          yield {
            type: 'thinking_delta',
            content: delta.reasoning || delta.reasoning_content || '',
          };
        }

        if (delta.content) {
          yield { type: 'content_delta', content: delta.content };
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallMap.has(idx)) {
              toolCallMap.set(idx, {
                id: tc.id || `call_${idx}`,
                name: tc.function?.name || '',
                arguments: '',
              });
              yield {
                type: 'tool_use_start',
                toolCall: {
                  id: tc.id || `call_${idx}`,
                  name: tc.function?.name || '',
                  input: {},
                  status: 'running',
                },
              };
            }
            const entry = toolCallMap.get(idx)!;
            if (tc.function?.arguments) {
              entry.arguments += tc.function.arguments;
            }
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
          }
        }
      }
    }

    // Emit complete event
    const toolCalls: ToolCall[] = Array.from(toolCallMap.entries()).map(
      ([_idx, tc]) => ({
        id: tc.id,
        name: tc.name,
        input: parseArguments(tc.arguments),
        status: 'completed' as const,
      })
    );

    yield {
      type: 'complete',
      response: {
        toolCalls,
        finishReason: 'tool_use',
        usage: { inputTokens: 0, outputTokens: 0 },
      },
    };
  } catch (error: any) {
    if (error.name === 'AbortError') return;
    yield { type: 'error', error };
  } finally {
    reader.releaseLock();
  }
}

function parseArguments(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * OpenAI streaming provider implementing the Provider interface.
 */
export class OpenAIStreamingProvider implements Provider {
  private apiKey: string;
  private baseUrl: string;
  private modelId: string;

  constructor(config: {
    apiKey: string;
    baseUrl?: string;
    modelId?: string;
  }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.modelId = config.modelId || 'gpt-4o';
  }

  model(): ModelInfo {
    return {
      id: this.modelId,
      provider: 'openai',
      maxTokens: 16384,
      supportsThinking: true,
    };
  }

  async *streamResponse(
    messages: Message[],
    tools?: Tool[]
  ): AsyncIterable<ProviderEvent> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: messages.map((m) => ({
          role: m.role,
          content: serializeMessageContent(m),
        })),
        stream: true,
        stream_options: { include_usage: true },
        ...(tools && tools.length > 0
          ? {
              tools: tools.map((t) => {
                const info = t.info();
                return {
                  type: 'function',
                  function: {
                    name: info.name,
                    description: info.description,
                    parameters: info.schema || {},
                  },
                };
              }),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      yield {
        type: 'error',
        error: new Error(`OpenAI API error (${response.status}): ${errorBody}`),
      };
      return;
    }

    yield* parseOpenAIStream(response.body);
  }

  async sendMessages(
    messages: Message[],
    tools?: Tool[]
  ): Promise<{
    content: string;
    toolCalls: ToolCall[];
    usage: TokenUsage;
    finishReason: FinishReason;
  }> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: messages.map((m) => ({
          role: m.role,
          content: serializeMessageContent(m),
        })),
        ...(tools && tools.length > 0
          ? {
              tools: tools.map((t) => {
                const info = t.info();
                return {
                  type: 'function',
                  function: {
                    name: info.name,
                    description: info.description,
                    parameters: info.schema || {},
                  },
                };
              }),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as any;
    const choice = data.choices?.[0];
    const toolCalls: ToolCall[] = (choice?.message?.tool_calls || []).map(
      (tc: any) => ({
        id: tc.id,
        name: tc.function?.name || '',
        input: parseArguments(tc.function?.arguments || '{}'),
        status: 'completed' as const,
      })
    );

    return {
      content: choice?.message?.content || '',
      toolCalls,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        cacheReadTokens: data.usage?.prompt_tokens_details?.cached_tokens,
      },
      finishReason: (choice?.finish_reason === 'tool_calls'
        ? 'tool_use'
        : choice?.finish_reason || 'stop') as FinishReason,
    };
  }
}

function serializeMessageContent(msg: Message): string | any[] {
  const textParts = msg.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as any).text)
    .join('');

  const toolResults = msg.parts
    .filter((p) => p.type === 'tool_result')
    .map((p: any) => ({
      type: 'tool_result',
      tool_call_id: p.toolCallId,
      content: p.content,
      is_error: p.isError,
    }));

  if (toolResults.length > 0) {
    const result: any[] = [];
    if (textParts) result.push({ type: 'text', text: textParts });
    result.push(...toolResults);
    return result;
  }

  return textParts;
}
