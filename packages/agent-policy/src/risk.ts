import type { TaskType, RiskLevel } from '@brickops/contracts';

/**
 * Risk classification policy.
 * Maps task types to their default risk levels and whether they require approval.
 */

export interface RiskPolicy {
  defaultRisk: RiskLevel;
  requiresApproval: boolean;
  description: string;
}

export const RISK_POLICIES: Record<TaskType, RiskPolicy> = {
  'intent-parse': {
    defaultRisk: 'low',
    requiresApproval: false,
    description: 'Parsing user intent from natural language.',
  },
  'plan-classify': {
    defaultRisk: 'low',
    requiresApproval: false,
    description: 'Classifying a plan or request.',
  },
  'status-summary': {
    defaultRisk: 'low',
    requiresApproval: false,
    description: 'Generating a status summary.',
  },
  'architecture-plan': {
    defaultRisk: 'medium',
    requiresApproval: true,
    description: 'Creating or modifying the project architecture.',
  },
  'code-edit': {
    defaultRisk: 'medium',
    requiresApproval: false,
    description: 'Editing existing code files.',
  },
  'code-scaffold': {
    defaultRisk: 'medium',
    requiresApproval: false,
    description: 'Creating new files or modules.',
  },
  'code-review': {
    defaultRisk: 'low',
    requiresApproval: false,
    description: 'Reviewing code changes.',
  },
  'reality-check': {
    defaultRisk: 'low',
    requiresApproval: false,
    description: 'Verifying production readiness.',
  },
  'whatsapp-response': {
    defaultRisk: 'low',
    requiresApproval: false,
    description: 'Generating a WhatsApp response message.',
  },
};

export function getRiskPolicy(taskType: TaskType): RiskPolicy {
  return RISK_POLICIES[taskType];
}

/**
 * Elevated risk keywords that bump a request's risk level up.
 */
export const RISK_ESCALATION_KEYWORDS = [
  'delete',
  'drop',
  'remove',
  'destroy',
  'secret',
  'password',
  'credential',
  'deploy',
  'production',
  'migration',
  'rollback',
  'env',
  'api key',
  'token',
  'auth',
  'permission',
  'admin',
  'sudo',
  'root',
];

export function detectEscalatedRisk(text: string): RiskLevel {
  const lower = text.toLowerCase();
  const hits = RISK_ESCALATION_KEYWORDS.filter((kw) => lower.includes(kw));
  if (hits.length >= 3) return 'critical';
  if (hits.length >= 2) return 'high';
  if (hits.length >= 1) return 'medium';
  return 'low';
}
