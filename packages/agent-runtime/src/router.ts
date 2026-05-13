import type { TaskType, ModelTier, AgentRole } from '@brickops/contracts';

/**
 * Model router: maps task types to the correct model tier.
 *
 * From the blueprint:
 *  - Intent parsing, classification, summaries → cheap
 *  - Code patches → mid/strong
 *  - Architecture, reality checking → strong
 *
 * This separation prevents "every message burns premium-model budget."
 */

const TASK_MODEL_MAP: Record<TaskType, ModelTier> = {
  'intent-parse': 'cheap',
  'plan-classify': 'cheap',
  'status-summary': 'cheap',
  'whatsapp-response': 'cheap',
  'code-edit': 'mid',
  'code-scaffold': 'mid',
  'code-review': 'mid',
  'architecture-plan': 'strong',
  'reality-check': 'strong',
};

/**
 * Select the appropriate model tier for a given task type.
 */
export function selectModelTier(taskType: TaskType): ModelTier {
  return TASK_MODEL_MAP[taskType] || 'mid';
}

/**
 * Select the default agent roles for a given task type.
 */
export function selectDefaultRoles(taskType: TaskType): AgentRole[] {
  switch (taskType) {
    case 'intent-parse':
      return ['router'];
    case 'plan-classify':
      return ['router'];
    case 'status-summary':
      return ['project-shepherd'];
    case 'whatsapp-response':
      return ['project-shepherd'];
    case 'architecture-plan':
      return ['software-architect', 'planner'];
    case 'code-edit':
      return ['minimal-change-engineer', 'code-reviewer'];
    case 'code-scaffold':
      return ['scaffold-agent', 'code-reviewer'];
    case 'code-review':
      return ['code-reviewer'];
    case 'reality-check':
      return ['reality-checker'];
    default:
      return ['router'];
  }
}
