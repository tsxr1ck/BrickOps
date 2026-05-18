import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = 'http://localhost:3001';

export interface PipelineStage {
  name: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  timestamp: number;
}

export function useProjectEvents(projectId: string | null) {
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [pipelineActive, setPipelineActive] = useState(false);
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const [projectConnected, setProjectConnected] = useState(false);
  const evtSourceRef = useRef<EventSource | null>(null);

  const mergeStage = useCallback((stage: PipelineStage) => {
    setPipelineStages(prev => {
      const idx = prev.findIndex(s => s.name === stage.name);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...stage };
        return next;
      }
      // Insert at top so newest stages appear first
      return [stage, ...prev];
    });
  }, []);

  useEffect(() => {
    if (!projectId) {
      setPipelineStages([]);
      setPipelineActive(false);
      setProjectStatus(null);
      setProjectConnected(false);
      return;
    }

    if (evtSourceRef.current) {
      evtSourceRef.current.close();
    }

    const evtSource = new EventSource(`${API_BASE}/events/project/${projectId}`);
    evtSourceRef.current = evtSource;

    evtSource.onopen = () => setProjectConnected(true);
    evtSource.onerror = () => setProjectConnected(false);

    // Pipeline run.step events (run.started, run.step_changed, run.completed, run.failed)
    // All map to SSE event type "run.step" via the server's mapEventType
    evtSource.addEventListener('run.step', (e: MessageEvent) => {
      const data = JSON.parse(e.data);

      if (data.type === 'run.started') {
        setPipelineActive(true);
        mergeStage({ name: 'Pipeline started', status: 'active', timestamp: data.timestamp || Date.now() });
        return;
      }

      if (data.type === 'run.completed') {
        setPipelineActive(false);
        mergeStage({ name: 'Pipeline completed', status: 'completed', timestamp: data.timestamp || Date.now() });
        return;
      }

      if (data.type === 'run.failed') {
        setPipelineActive(false);
        mergeStage({ name: `Failed: ${data.reason || 'Unknown error'}`, status: 'failed', timestamp: data.timestamp || Date.now() });
        return;
      }

      if (data.type === 'run.step_changed') {
        const s = data.stepStatus === 'active' ? 'active' as const
          : data.stepStatus === 'failed' ? 'failed' as const
          : 'completed' as const;
        mergeStage({
          name: data.stepName || 'Step',
          status: s,
          timestamp: data.timestamp || Date.now(),
        });
        return;
      }
    });

    // Project status updates → project.updated or project.update
    evtSource.addEventListener('project.updated', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      if (data.status) {
        setProjectStatus(data.status);
        const active = !['draft', 'ready_to_deploy', 'deployed', 'failed', 'awaiting_clarification', 'awaiting_plan_approval'].includes(data.status);
        setPipelineActive(active);
        mergeStage({
          name: data.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          status: active ? 'active' : 'completed',
          timestamp: data.timestamp || Date.now(),
        });
      }
    });

    evtSource.addEventListener('project.update', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      if (data.status) {
        setProjectStatus(data.status);
      }
    });

    // Session events for this project → generic "session.run" SSE type
    evtSource.addEventListener('session.run', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      if (data.type === 'session.run_started') {
        setPipelineActive(true);
        mergeStage({ name: 'Session run started', status: 'active', timestamp: data.timestamp || Date.now() });
      }
      if (data.type === 'session.run_completed') {
        setPipelineActive(false);
        mergeStage({ name: 'Session run completed', status: 'completed', timestamp: data.timestamp || Date.now() });
      }
      if (data.type === 'session.error') {
        mergeStage({ name: `Error: ${data.message || ''}`, status: 'failed', timestamp: data.timestamp || Date.now() });
      }
    });

    return () => {
      evtSource.close();
      evtSourceRef.current = null;
      setProjectConnected(false);
    };
  }, [projectId, mergeStage]);

  return {
    pipelineStages,
    pipelineActive,
    projectStatus,
    projectConnected,
  };
}
