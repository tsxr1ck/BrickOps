import { useParams } from 'react-router-dom';
import { Button, WorkspaceLayout, usePageTitle, PageHeader } from '@brickops/ui';
import type { ThinkingStep } from '@brickops/ui';
import { useProject, useWorkspaceFiles, useWorkspaceFileContent, usePreviewStatus } from '../hooks/useProjects';
import { useSessionEvents } from '../hooks/useSessionEvents';
import { useProjectEvents } from '../hooks/useProjectEvents';
import { ProjectSidebar } from '../components/ProjectSidebar';
import { ChatAndEditor } from '../components/ChatAndEditor';
import { TimelineAndPreview } from '../components/TimelineAndPreview';
import { useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react';
import { X, ArrowRight, CheckCircle2, Activity } from 'lucide-react';

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 'var(--bo-z-overlay)',
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--bo-space-4)',
};

const calloutCard: CSSProperties = {
  background: 'var(--bo-bg-surface)',
  borderRadius: 'var(--bo-radius-md)',
  border: '1px solid var(--bo-border)',
  padding: 'var(--bo-space-5)',
  maxWidth: '400px',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-3)',
  boxShadow: 'var(--bo-shadow-lg)',
};

const ONBOARDING_STEPS = [
  {
    icon: <Activity size={24} />,
    title: 'Project & Sessions',
    desc: 'Left panel: navigate between apps and sessions, browse files.',
  },
  {
    icon: <CheckCircle2 size={24} />,
    title: 'Chat & Editor',
    desc: 'Center: describe changes, review code, approve or revert runs.',
  },
  {
    icon: <ArrowRight size={24} />,
    title: 'Timeline & Preview',
    desc: 'Right panel: see what the agent is doing in real time and preview the app.',
  },
];

const skeletonBlock: CSSProperties = {
  background: 'var(--bo-bg-surface)',
  borderRadius: 'var(--bo-radius-md)',
  minHeight: '200px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--bo-text-tertiary)',
  fontSize: 'var(--bo-text-sm)',
  animation: 'bo-pulse 2s ease-in-out infinite',
};

export function WorkspacePage() {
  const { slug, projectId } = useParams<{ slug?: string; projectId?: string }>();
  const lookup = slug || projectId || '';
  const { project, threads, submitClarification } = useProject(lookup);
  const { files } = useWorkspaceFiles(project?.id || '');
  const { previewUrl, previewRunning, startPreview } = usePreviewStatus(project?.id || '');

  usePageTitle('Workspace', '/', project?.name || '');

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [asideTab, setAsideTab] = useState<'timeline' | 'files' | 'tests'>('timeline');
  const [clarificationAnswers, setClarificationAnswers] = useState<string[]>([]);
  const [submittingAnswers, setSubmittingAnswers] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [runCount, setRunCount] = useState(0);
  const [prevRunStatus, setPrevRunStatus] = useState<string>('idle');
  const [approvedRun, setApprovedRun] = useState<number | null>(null);

  const { content: fileContent, loading: fileLoading } = useWorkspaceFileContent(project?.id || '', selectedFile);

  const {
    messages: sessionMessages,
    timeline: sessionTimeline,
    changedFiles,
    runStatus,
    connected,
    testResults,
    startRun,
    cancelRun,
  } = useSessionEvents(sessionId);

  const {
    pipelineStages,
    pipelineActive,
    projectStatus,
  } = useProjectEvents(project?.id || null);

  // Show onboarding for new projects
  useEffect(() => {
    if (project && !sessionMessages.length && !sessionTimeline.length) {
      const dismissed = localStorage.getItem(`bo-onboard-${project.id}`);
      if (!dismissed) {
        setShowOnboarding(true);
      }
    }
  }, [project, sessionMessages.length, sessionTimeline.length]);

  // Track run count
  useEffect(() => {
    if (prevRunStatus === 'running' && runStatus === 'idle') {
      setRunCount(c => c + 1);
    }
    setPrevRunStatus(runStatus);
  }, [runStatus, prevRunStatus]);

  const clarificationQuestions = useMemo(() => {
    if (project?.status !== 'awaiting_clarification') return null;
    const sysThread = threads?.findLast(
      (t: any) => t.role === 'system' && t.content?.includes('"questions"')
    );
    if (!sysThread) return null;
    try {
      const data = JSON.parse(sysThread.content);
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        return data.questions as string[];
      }
    } catch {}
    return null;
  }, [project?.status, threads]);

  useEffect(() => {
    if (clarificationQuestions) {
      setClarificationAnswers(new Array(clarificationQuestions.length).fill(''));
    }
  }, [clarificationQuestions]);

  useEffect(() => {
    if (!project?.id) return;

    const key = `bo-session-${project.id}`;
    const stored = localStorage.getItem(key);

    // Try API first — returns existing session for this project
    fetch(`http://localhost:3001/projects/${project.id}/current-session`)
      .then(r => r.json())
      .then(data => {
        if (data?.id) {
          localStorage.setItem(key, data.id);
          setSessionId(data.id);
        }
      })
      .catch(() => {
        // API unavailable — fall back to localStorage or create new
        if (stored) {
          setSessionId(stored);
        } else if (!sessionId) {
          const newId = `session-${project.id}-${Date.now()}`;
          localStorage.setItem(key, newId);
          setSessionId(newId);
        }
      });
  }, [project?.id, sessionId]);

  const handleSend = useCallback(() => {
    if (!chatInput.trim() || runStatus === 'running') return;
    const msg = chatInput;
    setChatInput('');
    startRun(msg, project?.id);
  }, [chatInput, runStatus, project?.id, startRun]);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    if (project) {
      localStorage.setItem(`bo-onboard-${project.id}`, '1');
    }
  }, [project]);

  const handleApprove = useCallback(() => {
    if (runCount > 0) {
      setApprovedRun(runCount);
    }
  }, [runCount]);

  const handleRevert = useCallback(() => {
    cancelRun();
  }, [cancelRun]);

  const timelineEntries = useMemo(() => {
    const fromSession = sessionTimeline.map(e => ({
      id: e.id,
      title: e.title,
      description: e.description,
      timestamp: e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '',
      kind: e.kind,
      runId: e.runId,
      status: e.kind === 'session.run_completed' ? 'completed' as const
        : e.kind === 'session.error' ? 'failed' as const
        : e.kind === 'session.run_started' ? 'active' as const
        : 'pending' as const,
    }));
    const fromPipeline = pipelineStages.map(s => ({
      id: `pipe-${s.name}-${s.timestamp}`,
      title: s.status === 'active' ? `▶ ${s.name}` : s.status === 'failed' ? `✕ ${s.name}` : `✓ ${s.name}`,
      description: '',
      timestamp: s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : '',
      kind: `pipeline.${s.status}`,
      runId: 'pipeline',
      status: s.status as 'active' | 'completed' | 'failed' | 'pending',
    }));
    return [...fromPipeline, ...fromSession];
  }, [sessionTimeline, pipelineStages]);

  const thinkingSteps: ThinkingStep[] = useMemo(() => {
    const fromPipeline = pipelineStages.map(s => ({
      id: `pipe-${s.name}`,
      label: s.name,
      detail: '',
      status: s.status === 'active' ? 'running' as const
        : s.status === 'failed' ? 'error' as const
        : 'done' as const,
    }));
    const fromSession = sessionTimeline.map((e) => ({
      id: e.id,
      label: e.title,
      detail: e.description,
      status: e.kind === 'session.run_completed' ? 'done' as const
        : e.kind === 'session.error' ? 'error' as const
        : 'running' as const,
    }));
    const combined = [...fromPipeline, ...fromSession];
    const isActive = runStatus === 'running' || pipelineActive;
    if (isActive && combined.length === 0) {
      return [{ id: 'starting', label: 'Starting run...', status: 'running' as const }];
    }
    return combined;
  }, [sessionTimeline, runStatus, pipelineStages, pipelineActive]);

  if (!project) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)', height: '100%' }}>
        <PageHeader title="Workspace" subtitle="Loading project..." />
        <div style={skeletonBlock} />
      </div>
    );
  }

  const sidebar = (
    <ProjectSidebar
      project={project}
      runStatus={runStatus}
      connected={connected}
      sessionId={sessionId}
      files={files}
      selectedFile={selectedFile}
      onFileSelect={(path) => { setSelectedFile(path); setEditorVisible(true); }}
      onCancelRun={cancelRun}
      projectStatus={projectStatus}
      pipelineActive={pipelineActive}
    />
  );

  const main = clarificationQuestions ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)', padding: 'var(--bo-space-4)', overflow: 'auto', flex: 1 }}>
      <div style={{ fontSize: 'var(--bo-text-base)', fontWeight: 700, color: 'var(--bo-accent)' }}>
        A few questions before planning
      </div>
      <div style={{ fontSize: 'var(--bo-text-sm)', color: 'var(--bo-text-secondary)', marginBottom: 'var(--bo-space-2)' }}>
        Answer each question to help refine the plan.
      </div>
      {clarificationQuestions.map((q, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-1)' }}>
          <label style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-text)' }}>{i + 1}. {q}</label>
          <input
            style={{
              padding: 'var(--bo-space-3) var(--bo-space-4)',
              borderRadius: 'var(--bo-radius-sm)',
              border: '1px solid var(--bo-border)',
              background: 'var(--bo-bg-input)',
              color: 'var(--bo-text)',
              fontSize: 'var(--bo-text-sm)',
              outline: 'none',
              fontFamily: 'var(--bo-font-sans)',
            }}
            value={clarificationAnswers[i] || ''}
            onChange={(e) => {
              const next = [...clarificationAnswers];
              next[i] = e.target.value;
              setClarificationAnswers(next);
            }}
            placeholder="Your answer..."
            disabled={submittingAnswers}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 'var(--bo-space-2)', paddingTop: 'var(--bo-space-2)' }}>
        <Button
          variant="filled"
          onClick={async () => {
            setSubmittingAnswers(true);
            await submitClarification(clarificationAnswers);
            setSubmittingAnswers(false);
          }}
          disabled={submittingAnswers || clarificationAnswers.every(a => !a?.trim())}
        >
          {submittingAnswers ? 'Submitting...' : 'Submit Answers'}
        </Button>
      </div>
    </div>
  ) : (
    <ChatAndEditor
      messages={sessionMessages}
      isRunning={runStatus === 'running'}
      thinkingSteps={thinkingSteps}
      onSend={handleSend}
      inputValue={chatInput}
      onInputChange={setChatInput}
      disabled={runStatus === 'running'}
      editorVisible={editorVisible}
      selectedFile={selectedFile}
      fileContent={fileContent}
      fileLoading={fileLoading}
      runCount={runCount}
      onApprove={handleApprove}
      onRevert={handleRevert}
      onCancelRun={cancelRun}
    />
  );

  const aside = (
    <TimelineAndPreview
      activeTab={asideTab}
      onTabChange={setAsideTab}
      timelineEntries={timelineEntries}
      changedFiles={changedFiles}
      testResults={testResults}
      previewRunning={previewRunning}
      previewUrl={previewUrl}
      onStartPreview={startPreview}
      onFileClick={(path) => { setSelectedFile(path); setEditorVisible(true); }}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Approval toast */}
      {approvedRun !== null && (
        <div style={{
          position: 'fixed', top: 'var(--bo-header-height)', left: '50%', transform: 'translateX(-50%)',
          zIndex: 'var(--bo-z-overlay)', padding: 'var(--bo-space-2) var(--bo-space-4)',
          borderRadius: 'var(--bo-radius-md)', background: 'var(--bo-success-bg)', color: 'var(--bo-success)',
          fontSize: 'var(--bo-text-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 'var(--bo-space-2)',
          boxShadow: 'var(--bo-shadow-md)', border: '1px solid var(--bo-success)',
        }}>
          <CheckCircle2 size={16} />
          Run #{approvedRun} approved.
          <button onClick={() => setApprovedRun(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 'var(--bo-space-2)' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Onboarding overlay */}
      {showOnboarding && (
        <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) dismissOnboarding(); }}>
          <div style={calloutCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-text)' }}>
                Welcome to {project.name}
              </span>
              <button onClick={dismissOnboarding} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bo-text-secondary)' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 'var(--bo-space-2) 0', display: 'flex', justifyContent: 'center', color: 'var(--bo-accent)' }}>
              {ONBOARDING_STEPS[onboardingStep].icon}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--bo-text-base)', fontWeight: 600, color: 'var(--bo-text)' }}>
                {ONBOARDING_STEPS[onboardingStep].title}
              </div>
              <div style={{ fontSize: 'var(--bo-text-sm)', color: 'var(--bo-text-secondary)', marginTop: 'var(--bo-space-1)' }}>
                {ONBOARDING_STEPS[onboardingStep].desc}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', paddingTop: 'var(--bo-space-1)' }}>
              {ONBOARDING_STEPS.map((_, i) => (
                <span key={i} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: i === onboardingStep ? 'var(--bo-accent)' : 'var(--bo-border)',
                  transition: 'background var(--bo-transition-fast)',
                }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--bo-space-2)', paddingTop: 'var(--bo-space-2)' }}>
              {onboardingStep < ONBOARDING_STEPS.length - 1 ? (
                <Button variant="filled" size="sm" onClick={() => setOnboardingStep(s => s + 1)}>
                  Next <ArrowRight size={14} />
                </Button>
              ) : (
                <Button variant="filled" size="sm" onClick={dismissOnboarding}>
                  Got it
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <WorkspaceLayout sidebar={sidebar} main={main} aside={aside} />
    </div>
  );
}
