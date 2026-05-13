import type {
  AgentRole,
  TaskType,
  AgentResponse,
  ContextManifest,
} from '@brickops/contracts';
import type { ProviderAdapter } from './providers';
import { buildPrompt, estimatePromptTokens } from './prompt-builder';
import { selectModelTier } from './router';
import { parseJsonFromLLM } from './json-parser';

export interface ExecuteAgentOptions {
  role: AgentRole;
  taskType: TaskType;
  taskPrompt: string;
  context?: ContextManifest;
  projectSummary?: string;
  actionSchema?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Execute a single specialist agent invocation.
 *
 * This is the main entry point for the agent runtime. It:
 * 1. Builds a layered prompt (caching-optimized)
 * 2. Selects the right model tier
 * 3. Calls the provider
 * 4. Parses the JSON response
 * 5. Returns the structured result with usage telemetry
 */
export class AgentExecutor {
  private providers: Map<string, ProviderAdapter> = new Map();
  private defaultProvider: string = '';

  /**
   * Register a provider adapter (e.g., OpenAI, Anthropic).
   */
  registerProvider(adapter: ProviderAdapter, isDefault = false): void {
    this.providers.set(adapter.name, adapter);
    if (isDefault || this.providers.size === 1) {
      this.defaultProvider = adapter.name;
    }
  }

  /**
   * Run a specialist agent with the given options.
   */
  async execute(options: ExecuteAgentOptions): Promise<AgentResponse> {
    const {
      role,
      taskType,
      taskPrompt,
      context,
      projectSummary,
      actionSchema,
      maxTokens,
      temperature,
    } = options;

    // Build the layered prompt
    const messages = buildPrompt({
      role,
      taskPrompt,
      context,
      projectSummary,
      actionSchema,
    });

    // Select model tier based on task type
    const tier = selectModelTier(taskType);

    // Get the provider
    const provider = this.providers.get(this.defaultProvider);
    if (!provider) {
      throw new Error('No provider registered. Call registerProvider() first.');
    }

    // Resolve the actual model name from the tier
    const model = (provider as any).getModel?.(tier) || tier;

    // Log prompt size for observability
    const estimatedTokens = estimatePromptTokens(messages);
    console.log(
      `[agent-runtime] role=${role} task=${taskType} tier=${tier} model=${model} est_tokens=${estimatedTokens}`
    );

    // Call the provider
    const response = await provider.chat(model, messages, {
      maxTokens: maxTokens || 4096,
      temperature: temperature ?? 0.3,
    });

    // Attempt to parse JSON from the response
    response.parsedJson = parseJsonFromLLM(response.content);

    // Log usage for telemetry
    console.log(
      `[agent-runtime] done: prompt=${response.usage.promptTokens} cached=${response.usage.cachedTokens} completion=${response.usage.completionTokens} duration=${response.durationMs}ms`
    );

    return response;
  }
}
