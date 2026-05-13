import type { AgentRole, PromptMessage, ContextManifest } from '@brickops/contracts';
import { getPersonaSystemPrompt, RUNTIME_RULES } from '@brickops/agent-policy';

/**
 * Layered prompt builder optimized for prompt caching.
 *
 * Layer order (stable → dynamic):
 *   1. Stable persona block        (cacheable)
 *   2. Stable HQ runtime rules     (cacheable)
 *   3. Stable action/tool schema   (cacheable)
 *   4. Dynamic project summary     (semi-stable)
 *   5. Dynamic task request         (changes every call)
 *   6. Dynamic file slices          (changes every call)
 *
 * OpenAI caches automatically on identical leading tokens.
 * Anthropic uses explicit cache_control on system blocks.
 * Both benefit from this ordering.
 */

export interface PromptBuilderOptions {
  role: AgentRole;
  taskPrompt: string;
  context?: ContextManifest;
  projectSummary?: string;
  actionSchema?: string;
}

export function buildPrompt(options: PromptBuilderOptions): PromptMessage[] {
  const { role, taskPrompt, context, projectSummary, actionSchema } = options;
  const messages: PromptMessage[] = [];

  // Layer 1: Stable persona (cacheable)
  messages.push({
    role: 'system',
    content: getPersonaSystemPrompt(role),
    cacheable: true,
  });

  // Layer 2: Stable runtime rules (cacheable)
  messages.push({
    role: 'system',
    content: RUNTIME_RULES,
    cacheable: true,
  });

  // Layer 3: Stable action/tool schema (cacheable if provided)
  if (actionSchema) {
    messages.push({
      role: 'system',
      content: `## Available Actions\n\n${actionSchema}`,
      cacheable: true,
    });
  }

  // Layer 4: Semi-stable project summary
  if (projectSummary) {
    messages.push({
      role: 'system',
      content: `## Project Context\n\n${projectSummary}`,
      cacheable: false,
    });
  }

  // Layer 5: Dynamic task request
  let userContent = taskPrompt;

  // Layer 6: Dynamic file slices (appended to user message)
  if (context && context.targetFiles.length > 0) {
    const fileContext = context.targetFiles
      .filter((f) => f.content)
      .map((f) => {
        const lineInfo = f.fromLine && f.toLine ? ` (lines ${f.fromLine}-${f.toLine})` : '';
        return `### ${f.path}${lineInfo}\n\`\`\`\n${f.content}\n\`\`\``;
      })
      .join('\n\n');

    userContent += `\n\n## Relevant Files\n\n${fileContext}`;

    // Add related files as a short reference list
    if (context.relatedFiles.length > 0) {
      const relatedList = context.relatedFiles
        .map((f) => `- ${f.path}: ${f.reason}`)
        .join('\n');
      userContent += `\n\n## Related Files (for reference)\n\n${relatedList}`;
    }
  }

  messages.push({
    role: 'user',
    content: userContent,
  });

  return messages;
}

/**
 * Estimate total token count from a set of prompt messages.
 */
export function estimatePromptTokens(messages: PromptMessage[]): number {
  return messages.reduce((total, msg) => total + Math.ceil(msg.content.length / 4), 0);
}
