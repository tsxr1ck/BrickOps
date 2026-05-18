/**
 * Stub for @brickops/orchestrator package.
 */

export interface Orchestrator {
  triggerPipeline(projectId: string): void;
  continueAfterClarification(projectId: string): void;
}

export function createOrchestrator(): Orchestrator {
  return {
    triggerPipeline: (projectId: string) => {
      console.log(`[orchestrator] Pipeline triggered for ${projectId}`);
    },
    continueAfterClarification: (projectId: string) => {
      console.log(`[orchestrator] Continuing after clarification for ${projectId}`);
    },
  };
}
