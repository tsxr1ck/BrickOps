import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = 'http://localhost:3001';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'agent';
  content: string;
  timestamp: number;
}

export interface TimelineEvent {
  id: string;
  kind: string;
  title: string;
  description?: string;
  timestamp: number;
  runId: string;
}

export interface ChangedFile {
  path: string;
  action: 'written' | 'diff' | 'read' | 'deleted';
  timestamp: number;
}

function eventToTitle(kind: string, data: any): string {
  switch (kind) {
    case 'llm_thinking_delta': return 'Thinking...';
    case 'llm_content_delta': return 'Generating response';
    case 'tool_started': return `Tool: ${data.toolName}`;
    case 'tool_finished': return `Tool done: ${data.toolName}`;
    case 'file_read': return `Read: ${data.filePath}`;
    case 'file_written': return `Wrote: ${data.filePath}`;
    case 'diff_applied': return `Diff: ${data.filePath}`;
    case 'tests_started': return `Test: ${data.command}`;
    case 'tests_finished': return `Tests: ${data.passed}/${data.passed + data.failed} passed`;
    case 'session.run_started': return 'Run started';
    case 'session.run_completed': return 'Run completed';
    case 'session.error': return `Error: ${data.message}`;
    default: return kind;
  }
}

export function useSessionEvents(sessionId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [connected, setConnected] = useState(false);
  const [testResults, setTestResults] = useState<{ passed: number; failed: number; total: number } | null>(null);
  const evtSourceRef = useRef<EventSource | null>(null);

  const clear = useCallback(() => {
    setMessages([]);
    setTimeline([]);
    setChangedFiles([]);
    setRunStatus('idle');
    setTestResults(null);
  }, []);

  useEffect(() => {
    if (!sessionId) {
      clear();
      return;
    }

    if (evtSourceRef.current) {
      evtSourceRef.current.close();
    }

    // Load persisted session history first
    fetch(`${API_BASE}/sessions/${sessionId}/history`)
      .then(r => {
        if (!r.ok) throw new Error(`History fetch ${r.status}: ${r.statusText}`);
        return r.json();
      })
      .then(data => {
        if (data.messages?.length) {
          setMessages(data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })));
        }
        if (data.timeline?.length) {
          setTimeline(data.timeline.map((t: any) => ({
            id: t.id,
            kind: t.kind,
            title: t.title,
            description: t.description,
            timestamp: t.timestamp,
            runId: t.runId,
          })));
        }
        if (data.status === 'running') setRunStatus('running');
      })
      .catch((err) => console.warn('[session] history fetch failed:', err));

    const evtSource = new EventSource(`${API_BASE}/sessions/${sessionId}/events`);
    evtSourceRef.current = evtSource;

    evtSource.onopen = () => setConnected(true);
    evtSource.onerror = () => setConnected(false);

    evtSource.addEventListener('session.run_started', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setRunStatus('running');
      setMessages(prev => [...prev, {
        id: `run-start-${data.timestamp}`,
        role: 'system',
        content: data.prompt ? `> ${data.prompt}` : 'Run started',
        timestamp: data.timestamp,
      }]);
      setTimeline(prev => [...prev, {
        id: `evt-${data.timestamp}`,
        kind: 'session.run_started',
        title: 'Run started',
        timestamp: data.timestamp,
        runId: data.runId || sessionId,
      }]);
    });

    evtSource.addEventListener('session.run_completed', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setRunStatus('idle');
      if (data.summary) {
        setMessages(prev => [...prev, {
          id: `completion-${data.timestamp}`,
          role: 'assistant',
          content: data.summary,
          timestamp: data.timestamp,
        }]);
      }
      setTimeline(prev => [...prev, {
        id: `evt-${data.timestamp}`,
        kind: 'session.run_completed',
        title: 'Run completed',
        description: data.summary,
        timestamp: data.timestamp,
        runId: data.runId || sessionId,
      }]);
    });

    evtSource.addEventListener('session.error', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setRunStatus('error');
      setMessages(prev => [...prev, {
        id: `error-${data.timestamp}`,
        role: 'system',
        content: `Error: ${data.message}`,
        timestamp: data.timestamp,
      }]);
      setTimeline(prev => [...prev, {
        id: `evt-${data.timestamp}`,
        kind: 'session.error',
        title: 'Error',
        description: data.message,
        timestamp: data.timestamp,
        runId: data.runId || sessionId,
      }]);
    });

    // File events
    const fileEventKinds = ['file_written', 'file_read', 'diff_applied'];
    for (const kind of fileEventKinds) {
      evtSource.addEventListener(kind, (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        const action = kind === 'file_written' ? 'written' : kind === 'file_read' ? 'read' : 'diff';
        setChangedFiles(prev => [...prev, {
          path: data.filePath,
          action,
          timestamp: data.timestamp,
        }]);
        setTimeline(prev => [...prev, {
          id: `evt-${data.timestamp}-${kind}-${Math.random().toString(36).slice(2, 6)}`,
          kind,
          title: eventToTitle(kind, data),
          timestamp: data.timestamp,
          runId: data.runId || sessionId,
        }]);
      });
    }

    // Tool events
    evtSource.addEventListener('tool_started', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setRunStatus('running');
      setTimeline(prev => [...prev, {
        id: `evt-${data.timestamp}-tool-start`,
        kind: 'tool_started',
        title: eventToTitle('tool_started', data),
        timestamp: data.timestamp,
        runId: data.runId || sessionId,
      }]);
    });

    evtSource.addEventListener('tool_finished', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setTimeline(prev => [...prev, {
        id: `evt-${data.timestamp}-tool-finish`,
        kind: 'tool_finished',
        title: eventToTitle('tool_finished', data),
        description: data.isError ? `Error: ${data.result}` : undefined,
        timestamp: data.timestamp,
        runId: data.runId || sessionId,
      }]);
    });

    // Test events
    evtSource.addEventListener('tests_started', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setTimeline(prev => [...prev, {
        id: `evt-${data.timestamp}-tests`,
        kind: 'tests_started',
        title: eventToTitle('tests_started', data),
        timestamp: data.timestamp,
        runId: data.runId || sessionId,
      }]);
    });

    evtSource.addEventListener('tests_finished', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      const passed = typeof data.passed === 'number' ? data.passed : 0;
      const failed = typeof data.failed === 'number' ? data.failed : 0;
      setTestResults({ passed, failed, total: passed + failed });
      setTimeline(prev => [...prev, {
        id: `evt-${data.timestamp}-tests-done`,
        kind: 'tests_finished',
        title: eventToTitle('tests_finished', data),
        description: `${passed} passed, ${failed} failed`,
        timestamp: data.timestamp,
        runId: data.runId || sessionId,
      }]);
    });

    return () => {
      evtSource.close();
      evtSourceRef.current = null;
      clear();
    };
  }, [sessionId, clear]);

  async function startRun(prompt: string, projectId?: string) {
    if (!sessionId) return;
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, projectId }),
      });
      if (!res.ok) throw new Error('Failed to start run');
      setMessages(prev => [...prev, {
        id: `user-msg-${Date.now()}`,
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      }]);
    } catch (err: any) {
      setRunStatus('error');
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'system',
        content: `Failed to start: ${err.message}`,
        timestamp: Date.now(),
      }]);
    }
  }

  async function cancelRun() {
    if (!sessionId) return;
    try {
      await fetch(`${API_BASE}/sessions/${sessionId}/cancel`, { method: 'POST' });
      setRunStatus('idle');
    } catch {}
  }

  return {
    messages,
    timeline,
    changedFiles,
    runStatus,
    connected,
    testResults,
    startRun,
    cancelRun,
    clear,
  };
}
