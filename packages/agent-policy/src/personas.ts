import fs from 'fs';
import path from 'path';
import type { AgentRole } from '@brickops/contracts';

/**
 * Persona registry backed by real agency-agents markdown files.
 * Source: https://github.com/msitarzewski/agency-agents
 *
 * Each persona is loaded from its .md file in the personas/ directory.
 * The markdown content IS the system prompt — we send the full persona
 * definition to the model so it gets the identity, mission, rules,
 * workflow, deliverable templates, and communication style.
 *
 * The blueprint says: "use persona modules, not a giant imported universe."
 * So we only operationalize the roles that map to our pipeline stages.
 */

export interface Persona {
  role: AgentRole;
  name: string;
  description: string;
  /** The full agency-agents markdown — this IS the system prompt. */
  systemPrompt: string;
}

/**
 * Maps our pipeline roles to their agency-agents persona files.
 * Only the roles that align with the BrickOps orchestrator pipeline.
 */
const ROLE_FILE_MAP: Record<AgentRole, string | null> = {
  'router': null, // Router is BrickOps-native, no agency-agents persona
  'planner': 'product-manager.md',
  'software-architect': 'software-architect.md',
  'frontend-developer': 'frontend-developer.md',
  'backend-architect': 'backend-architect.md',
  'ai-engineer': 'ai-engineer.md',
  'code-reviewer': 'code-reviewer.md',
  'reality-checker': 'reality-checker.md',
  'minimal-change-engineer': 'senior-developer.md', // Senior Dev as the surgical patch specialist
  'scaffold-agent': 'senior-developer.md', // Senior Dev for scaffolding new projects
  'project-shepherd': 'project-shepherd.md',
};

/**
 * Inline system prompt for the Router role — the only BrickOps-native persona.
 * This one doesn't come from agency-agents because routing is pipeline-specific.
 */
const ROUTER_SYSTEM_PROMPT = `You are the BrickOps Router. Your job is to classify incoming requests and route them to the right specialist agent.

For each request, you must output a JSON object with:
- "taskType": one of "intent-parse", "plan-classify", "status-summary", "architecture-plan", "code-edit", "code-scaffold", "code-review", "reality-check", "whatsapp-response"
- "requiredRoles": array of agent roles needed (e.g. ["frontend-developer", "code-reviewer"])
- "riskLevel": "low", "medium", "high", or "critical"
- "reasoning": one sentence explaining your classification

Be precise. Never over-classify risk. Default to "low" unless the request touches auth, secrets, deployments, or destructive operations.`;

const PERSONAS_DIR = path.join(import.meta.dir, '..', 'personas');

/** Cache loaded personas so we only read from disk once. */
const cache = new Map<AgentRole, Persona>();

function loadPersonaFile(filename: string): string {
  const filePath = path.join(PERSONAS_DIR, filename);
  return fs.readFileSync(filePath, 'utf-8');
}

function buildPersona(role: AgentRole): Persona {
  const file = ROLE_FILE_MAP[role];

  if (role === 'router' || file === null) {
    return {
      role,
      name: 'Router',
      description: 'Classifies request type, risk level, and selects the right specialist.',
      systemPrompt: ROUTER_SYSTEM_PROMPT,
    };
  }

  const content = loadPersonaFile(file);

  // Extract name and description from the YAML frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  let name = role;
  let description = '';

  if (frontmatterMatch) {
    const fm = frontmatterMatch[1];
    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    const descMatch = fm.match(/^description:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim();
    if (descMatch) description = descMatch[1].trim();
  }

  return {
    role,
    name,
    description,
    systemPrompt: content,
  };
}

export function getPersona(role: AgentRole): Persona {
  if (!cache.has(role)) {
    cache.set(role, buildPersona(role));
  }
  return cache.get(role)!;
}

export function getAllPersonas(): Persona[] {
  const roles = Object.keys(ROLE_FILE_MAP) as AgentRole[];
  return roles.map((role) => getPersona(role));
}

export function getPersonaSystemPrompt(role: AgentRole): string {
  return getPersona(role).systemPrompt;
}
