import type { AgentRole } from '@brickops/contracts';
import compiledPersonas from './compiled-personas.json';

/**
 * Persona registry backed by compiled agency-agents markdown.
 *
 * Source: https://github.com/msitarzewski/agency-agents
 * Build: `bun run build` in packages/agent-policy
 *
 * The raw markdown files live in src/raw-personas/. The compiler
 * (scripts/compile-personas.ts) strips frontmatter, boilerplate,
 * and token-heavy template blocks, then writes compiled-personas.json.
 *
 * This module provides O(1) lookups with zero disk I/O at runtime.
 * The system prompt bytes are identical across every invocation,
 * which is a hard requirement for OpenAI/Anthropic prompt caching.
 */

export interface Persona {
  role: AgentRole;
  name: string;
  description: string;
  /** The compiled system prompt — token-optimized from agency-agents markdown. */
  systemPrompt: string;
}

/** Typed accessor for the compiled JSON data. */
const personas = compiledPersonas as Record<
  string,
  { name: string; description: string; systemPrompt: string }
>;

export function getPersona(role: AgentRole): Persona {
  const data = personas[role];

  if (!data) {
    throw new Error(
      `Persona not compiled for role: "${role}". ` +
        `Available: ${Object.keys(personas).join(', ')}. ` +
        `Run \`bun run build\` in packages/agent-policy to recompile.`
    );
  }

  return {
    role,
    name: data.name,
    description: data.description,
    systemPrompt: data.systemPrompt,
  };
}

export function getAllPersonas(): Persona[] {
  return (Object.keys(personas) as AgentRole[]).map((role) => getPersona(role));
}

export function getPersonaSystemPrompt(role: AgentRole): string {
  return getPersona(role).systemPrompt;
}
