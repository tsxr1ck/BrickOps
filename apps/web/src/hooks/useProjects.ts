import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:3001';

function mapProject(p: any) {
  const summary = p.threads?.find((t: any) => t.role === 'user')?.content || p.description || 'No description provided.';
  const lastAction = p.runs?.[0]?.steps?.find((s: any) => s.status === 'active')?.name || p.status;
  return { ...p, summary, lastAction };
}

export function useProjects() {
  const [projects, setProjects] = useState<any[]>([]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/projects`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.map(mapProject));
      }
    } catch (err) {
      console.error('Failed to fetch projects', err);
    }
  }, []);

  useEffect(() => {
    fetchProjects();

    const evtSource = new EventSource(`${API_BASE}/events`);
    evtSource.addEventListener('project.update', () => fetchProjects());
    evtSource.addEventListener('project.created', () => fetchProjects());
    
    return () => evtSource.close();
  }, [fetchProjects]);

  return { projects };
}

export function useProject(slugOrId: string) {
  const [project, setProject] = useState<any | null>(null);
  const [run, setRun] = useState<any | null>(null);
  const [threads, setThreads] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    if (!slugOrId) return;
    try {
      const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(slugOrId)}`);
      if (res.ok) {
        const data = await res.json();
        setProject(mapProject(data));
        setProjectId(data.id);
        if (data.threads) setThreads(data.threads);
        if (data.runs && data.runs.length > 0) {
          setRun(data.runs[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch project', err);
    }
  }, [slugOrId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // SSE subscription — separate effect so projectId is stable
  useEffect(() => {
    if (!projectId) return;

    const evtSource = new EventSource(`${API_BASE}/events/project/${projectId}`);
    evtSource.addEventListener('project.update', () => fetchProject());
    evtSource.addEventListener('run.step', () => fetchProject());

    return () => evtSource.close();
  }, [projectId, fetchProject]);

  async function submitClarification(answers: string[]) {
    if (!projectId) return;
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/clarify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (res.ok) {
        // Trigger pipeline resume
        await fetch(`${API_BASE}/projects/${projectId}/trigger`, { method: 'POST' });
        fetchProject();
      }
    } catch (err) {
      console.error('Failed to submit clarification', err);
    }
  }

  return { project, run, threads, fetchProject, submitClarification };
}

export function useApprovals() {
  const [approvals, setApprovals] = useState<any[]>([]);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/approvals`);
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.map((a: any) => ({
          ...a,
          projectName: a.project?.name,
          projectSlug: a.project?.slug,
        })));
      }
    } catch (err) {
      console.error('Failed to fetch approvals', err);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
    
    const evtSource = new EventSource(`${API_BASE}/events`);
    evtSource.addEventListener('approval.new', () => fetchApprovals());
    evtSource.addEventListener('approval.resolved', () => fetchApprovals());
    
    return () => evtSource.close();
  }, [fetchApprovals]);

  const pending = approvals.filter((a) => a.status === 'pending');

  async function approve(id: string) {
    try {
      await fetch(`${API_BASE}/approvals/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approved' }),
      });
      fetchApprovals();
    } catch (err) {
      console.error('Failed to approve', err);
    }
  }

  async function reject(id: string) {
    try {
      await fetch(`${API_BASE}/approvals/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'rejected' }),
      });
      fetchApprovals();
    } catch (err) {
      console.error('Failed to reject', err);
    }
  }

  return { approvals, pending, approve, reject };
}

export function usePendingCount() {
  const { pending } = useApprovals();
  return pending.length;
}

export async function sendModifyRequest(projectId: string, message: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error('Failed to send modify request');
  return res.json();
}

export function useWorkspaceFiles(projectId: string) {
  const [files, setFiles] = useState<Array<{ path: string; size: number; isDir: boolean }>>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { files, loading, refresh };
}

export function useWorkspaceFileContent(projectId: string, filePath: string | null) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId || !filePath) { setContent(null); return; }

    let cancelled = false;
    setLoading(true);

    fetch(`${API_BASE}/projects/${projectId}/files/${filePath}`)
      .then((res) => res.ok ? res.json() : { content: null })
      .then((data) => { if (!cancelled) setContent(data.content); })
      .catch(() => { if (!cancelled) setContent(null); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [projectId, filePath]);

  return { content, loading };
}

export function useWorkspaceInfo(projectId: string) {
  const [workspace, setWorkspace] = useState<any>(null);

  useEffect(() => {
    if (!projectId) return;
    fetch(`${API_BASE}/projects/${projectId}/workspace`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setWorkspace(data))
      .catch(() => setWorkspace(null));
  }, [projectId]);

  return { workspace };
}

export function usePreviewStatus(projectId: string) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewRunning, setPreviewRunning] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/preview/status`);
      if (res.ok) {
        const data = await res.json();
        setPreviewRunning(data.running);
        if (data.running && data.url) setPreviewUrl(data.url);
      }
    } catch {}
  }, [projectId]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const startPreview = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/preview/start`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setPreviewUrl(data.url);
          setPreviewRunning(true);
        }
      }
    } catch (err) {
      console.error('Failed to start preview', err);
    }
  }, [projectId]);

  return { previewUrl, previewRunning, startPreview };
}
