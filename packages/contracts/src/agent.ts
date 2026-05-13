/**
 * Agent runtime types shared across the system.
 */

export type AgentRole =
  | 'router'
  | 'planner'
  | 'software-architect'
  | 'frontend-developer'
  | 'backend-architect'
  | 'ai-engineer'
  | 'code-reviewer'
  | 'reality-checker'
  | 'minimal-change-engineer'
  | 'scaffold-agent'
  | 'project-shepherd';

export type ModelTier = 'cheap' | 'mid' | 'strong';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type TaskType =
  | 'intent-parse'
  | 'plan-classify'
  | 'status-summary'
  | 'architecture-plan'
  | 'code-edit'
  | 'code-scaffold'
  | 'code-review'
  | 'reality-check'
  | 'whatsapp-response';

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** If true, this block is stable and eligible for prompt caching. */
  cacheable?: boolean;
}

export interface AgentInvocation {
  role: AgentRole;
  taskType: TaskType;
  modelTier: ModelTier;
  messages: PromptMessage[];
  /** Max tokens for the completion response. */
  maxTokens?: number;
  /** Temperature override. */
  temperature?: number;
}

export interface AgentResponse {
  content: string;
  parsedJson?: any;
  usage: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
  };
  model: string;
  durationMs: number;
}

export interface ProviderConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  models: {
    cheap: string;
    mid: string;
    strong: string;
  };
}
