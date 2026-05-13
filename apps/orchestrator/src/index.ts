import { prisma } from '@brickops/db';
import { runPipeline, continuePipeline } from './pipeline';

/**
 * BrickOps Orchestrator
 *
 * Handles pipeline execution. Notifications are sent directly
 * by pipeline stages (no event bus dependency).
 */

export interface Orchestrator {
  triggerPipeline: (projectId: string) => void;
  continueAfterClarification: (projectId: string) => void;
}

export function createOrchestrator(): Orchestrator {
  console.log('[orchestrator] Initializing...');

  // Listen for project.created via event bus to auto-trigger pipelines
  try {
    const { bus } = require('@brickops/events');
    
    bus.on('project.created', (event: any) => {
      console.log(`[orchestrator] New project: ${event.name} (${event.projectId})`);
      runPipeline(event.projectId).catch((err) => {
        console.error(`[orchestrator] Pipeline error for ${event.projectId}:`, err);
      });
    });
  } catch (err) {
    console.warn('[orchestrator] Could not load event bus — manual trigger only');
  }

  console.log('[orchestrator] Ready');

  return {
    triggerPipeline: (projectId: string) => {
      runPipeline(projectId).catch((err) => {
        console.error(`[orchestrator] Pipeline error for ${projectId}:`, err);
      });
    },
    continueAfterClarification: (projectId: string) => {
      continuePipeline(projectId).catch((err) => {
        console.error(`[orchestrator] Continuation error for ${projectId}:`, err);
      });
    },
  };
}

if (import.meta.main) {
  console.log('[orchestrator] Running standalone');
  createOrchestrator();
}
