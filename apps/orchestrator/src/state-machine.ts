import type { ProjectStatus } from '@brickops/contracts';
import { prisma } from '@brickops/db';

/**
 * Orchestrator state machine.
 *
 * Enforces valid project state transitions. Every transition:
 * 1. Validates the transition is legal
 * 2. Updates the DB
 * 3. Emits a project.updated event
 *
 * The state graph matches the blueprint's 19-state lifecycle.
 */

/**
 * Legal state transitions.
 * Key = current state, Value = set of valid next states.
 */
const VALID_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  draft: ['awaiting_clarification', 'planning', 'failed'],
  awaiting_clarification: ['planning', 'failed'],
  planning: ['awaiting_plan_approval', 'failed'],
  awaiting_plan_approval: ['provisioning_workspace', 'planning', 'failed'],
  provisioning_workspace: ['indexing_workspace', 'failed'],
  indexing_workspace: ['routing_task', 'failed'],
  routing_task: ['coding', 'failed'],
  coding: ['reviewing', 'failed'],
  reviewing: ['awaiting_approval', 'installing', 'failed'],
  awaiting_approval: ['installing', 'coding', 'failed'],
  installing: ['testing', 'building', 'failed'],
  testing: ['building', 'failed'],
  building: ['capturing_preview', 'failed'],
  capturing_preview: ['awaiting_user_feedback', 'ready_to_deploy', 'coding', 'failed'],
  awaiting_user_feedback: ['ready_to_deploy', 'coding', 'failed'],
  ready_to_deploy: ['deploying', 'coding', 'failed'],
  deploying: ['deployed', 'failed'],
  deployed: ['coding', 'failed'],
  failed: ['draft', 'planning', 'provisioning_workspace', 'coding', 'installing', 'building'],
};

export class StateMachine {
  /**
   * Attempt a state transition for a project.
   * Throws if the transition is invalid.
   */
  async transition(
    projectId: string,
    toState: ProjectStatus,
    reason?: string
  ): Promise<void> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const fromState = project.status as ProjectStatus;
    const allowed = VALID_TRANSITIONS[fromState];

    if (!allowed || !allowed.includes(toState)) {
      throw new Error(
        `Invalid transition: ${fromState} → ${toState} for project ${projectId}`
      );
    }

    // Update DB
    await prisma.project.update({
      where: { id: projectId },
      data: { status: toState },
    });

    console.log(
      `[orchestrator] ${project.slug}: ${fromState} → ${toState}${reason ? ` (${reason})` : ''}`
    );

    // State change logged — notifications handled by pipeline stages directly
  }

  /**
   * Check if a transition is valid without executing it.
   */
  canTransition(fromState: ProjectStatus, toState: ProjectStatus): boolean {
    const allowed = VALID_TRANSITIONS[fromState];
    return !!allowed && allowed.includes(toState);
  }

  /**
   * Get the list of valid next states for a given current state.
   */
  nextStates(currentState: ProjectStatus): readonly ProjectStatus[] {
    return VALID_TRANSITIONS[currentState] || [];
  }
}
