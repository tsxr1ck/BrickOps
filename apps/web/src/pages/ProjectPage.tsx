import { useParams, Link } from 'react-router-dom';
import { Card, Badge, Button, Timeline, EmptyState, StatCard, WorkspaceLayout, ChatBubble } from '@brickops/ui';
import type { TimelineEntry, StepperStep } from '@brickops/ui';
import { ArrowLeft, Folder, File, Monitor, Send, Bot, Circle } from 'lucide-react';
import { useProject, useWorkspaceFiles, useWorkspaceInfo, usePreviewStatus, sendModifyRequest } from '../hooks/useProjects';
import { timeAgo } from '../data/mock';
import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-3)',
  padding: '0 var(--bo-space-4)',
  height: '48px',
  borderBottom: '1px solid var(--bo-border)',
  background: 'var(--bo-bg)',
  flexShrink: 0,
};

const tabBarStyle: CSSProperties = {
  display: 'flex',
  gap: 0,
  padding: '0 var(--bo-space-4)',
  borderBottom: '1px solid var(--bo-border)',
  background: 'var(--bo-bg)',
  flexShrink: 0,
};

const tabStyle = (active: boolean): CSSProperties => ({
  padding: 'var(--bo-space-2) var(--bo-space-3)',
  fontSize: 'var(--bo-text-sm)',
  fontWeight: active ? 600 : 400,
  color: active ? 'var(--bo-accent)' : 'var(--bo-text-secondary)',
  background: 'none',
  border: 'none',
  borderBottom: `2px solid ${active ? 'var(--bo-accent)' : 'transparent'}`,
  cursor: 'pointer',
  transition: 'all var(--bo-transition-fast)',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

const contentArea: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 'var(--bo-space-5)',
};

const sectionTitle: CSSProperties = {
  fontSize: 'var(--bo-text-base)',
  fontWeight: 600,
  color: 'var(--bo-text)',
  marginBottom: 'var(--bo-space-3)',
};

const summaryText: CSSProperties = {
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-text-secondary)',
  lineHeight: '1.5',
};

const actionRow: CSSProperties = {
  display: 'flex',
  gap: 'var(--bo-space-3)',
  flexWrap: 'wrap',
};

const metaGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 'var(--bo-space-3)',
};

const failureBox: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--bo-space-3)',
  padding: 'var(--bo-space-3) var(--bo-space-4)',
  background: 'var(--bo-error-bg)',
  borderRadius: 'var(--bo-radius-sm)',
  border: '1px solid var(--bo-error)',
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-error)',
  lineHeight: '1.4',
};

const fileTree: CSSProperties = {
  fontFamily: 'var(--bo-font-mono)',
  fontSize: 'var(--bo-text-sm)',
  lineHeight: '1.8',
  color: 'var(--bo-text)',
};

const fileItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '2px 0',
};

const previewFrame: CSSProperties = {
  width: '100%',
  height: '600px',
  border: '1px solid var(--bo-border)',
  borderRadius: 'var(--bo-radius-sm)',
  background: '#fff',
};

const fileCount: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '18px',
  height: '18px',
  borderRadius: 'var(--bo-radius-sm)',
  background: 'var(--bo-bg-elevated)',
  fontSize: 'var(--bo-text-xs)',
  fontWeight: 500,
  padding: '0 5px',
};

const previewActions: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 'var(--bo-space-3)',
};

export function ProjectPage() {
  const { slug } = useParams<{ slug: string }>();
  const { project, run, threads, fetchProject } = useProject(slug || '');
  const { files } = useWorkspaceFiles(project?.id || '');
  const { workspace } = useWorkspaceInfo(project?.id || '');
  const { previewUrl, previewRunning, startPreview } = usePreviewStatus(project?.id || '');
  const [activeTab, setActiveTab] = useState<'overview' | 'files' | 'preview' | 'chat'>('overview');
  const [deployResult, setDeployResult] = useState<any>(null);
  const [deploying, setDeploying] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threads]);

  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        description="This project doesn't exist or has been deleted."
        action={<Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--bo-space-2)', fontSize: 'var(--bo-text-sm)', color: 'var(--bo-text-secondary)', textDecoration: 'none' }}>← Back</Link>}
      />
    );
  }

  const isAwaiting = project.status.includes('awaiting') || project.status.includes('pending');
  const isFailed = project.status === 'failed';
  const isReady = project.status === 'ready_to_deploy' || project.status === 'deployed';
  const hasPreview = workspace?.hasDist;

  const timelineEntries: TimelineEntry[] = run
    ? run.steps.map((step: any) => ({
        id: step.id,
        title: step.name,
        timestamp: step.startedAt ? timeAgo(step.startedAt) : '—',
        status: step.status,
        description: step.status === 'failed' && run.failureReason ? run.failureReason : undefined,
      }))
    : [];

  const stepperSteps: StepperStep[] = run
    ? run.steps.map((step: any) => ({
        id: step.id,
        label: step.name,
        status: step.status,
      }))
    : [{ id: 'init', label: 'Awaiting start', status: 'pending' as const }];

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const res = await fetch(`http://localhost:3001/projects/${project.id}/deploy`, { method: 'POST' });
      const data = await res.json();
      setDeployResult(data);
    } catch (err: any) {
      setDeployResult({ error: err.message });
    }
    setDeploying(false);
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || sending) return;
    setSending(true);
    const msg = chatInput;
    setChatInput('');
    try {
      await sendModifyRequest(project.id, msg);
      fetchProject();
    } catch (err) {
      console.error('Failed to send modify request', err);
    }
    setSending(false);
  };

  const chatMessages = (
    <>
      {(!threads || threads.length === 0) ? (
        <ChatBubble role="system">No messages yet. Send a change request to start.</ChatBubble>
      ) : (
        threads.map((t: any) => (
          <ChatBubble
            key={t.id}
            role={t.role === 'user' ? 'user' : t.role === 'agent' ? 'agent' : 'assistant'}
            timestamp={t.createdAt ? timeAgo(t.createdAt) : undefined}
            avatar={t.role !== 'user' ? <Bot size={16} /> : undefined}
          >
            {t.content}
          </ChatBubble>
        ))
      )}
      {run?.currentStage === 'planning' && (
        <ChatBubble role="agent" avatar={<Circle size={14} />}>Generating architecture plan...</ChatBubble>
      )}
      <div ref={messagesEndRef} />
    </>
  );

  const chatInputArea = (
    <div style={{ display: 'flex', gap: 'var(--bo-space-2)' }}>
      <input
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
        placeholder="Describe what you want to build or change..."
        disabled={sending}
        style={{
          flex: 1,
          padding: 'var(--bo-space-3) var(--bo-space-4)',
          borderRadius: 'var(--bo-radius-sm)',
          border: '1px solid var(--bo-border)',
          background: 'var(--bo-bg-input)',
          color: 'var(--bo-text)',
          fontSize: 'var(--bo-text-sm)',
          outline: 'none',
          fontFamily: 'var(--bo-font-sans)',
        }}
      />
      <button
        onClick={handleChatSend}
        disabled={sending || !chatInput.trim()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '40px', height: '40px', borderRadius: 'var(--bo-radius-sm)',
          background: 'var(--bo-accent)', color: 'var(--bo-text-inverse)',
          border: 'none', cursor: 'pointer', flexShrink: 0,
          opacity: sending || !chatInput.trim() ? 0.4 : 1,
          transition: 'opacity var(--bo-transition-fast)',
        }}
        aria-label="Send"
      >
        <Send size={16} />
      </button>
    </div>
  );

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <Link to="/" style={{ display: 'flex', color: 'var(--bo-text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <h1 style={{ fontSize: 'var(--bo-text-base)', fontWeight: 700, color: 'var(--bo-text)', margin: 0 }}>
          {project.name}
        </h1>
        <Badge status={project.status} />
      </div>

      <div style={tabBarStyle}>
        <button style={tabStyle(activeTab === 'overview')} onClick={() => setActiveTab('overview')}>Overview</button>
        <button style={tabStyle(activeTab === 'files')} onClick={() => setActiveTab('files')}>
          Files {files.length > 0 && <span style={fileCount}>{files.filter((f: any) => !f.isDir).length}</span>}
        </button>
        <button style={tabStyle(activeTab === 'preview')} onClick={() => setActiveTab('preview')}>
          <Monitor size={14} /> Preview
        </button>
        <button style={tabStyle(activeTab === 'chat')} onClick={() => setActiveTab('chat')}>
          Modify
        </button>
      </div>

      {activeTab === 'chat' ? (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <WorkspaceLayout
            steps={stepperSteps}
            messages={chatMessages}
            inputArea={chatInputArea}
          />
        </div>
      ) : (
        <div style={contentArea}>
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)', maxWidth: '720px' }}>
              {isAwaiting && (
                <Card variant="approval">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
                    <span style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-warning)' }}>
                      Waiting for approval
                    </span>
                    <div style={actionRow}>
                      <Button variant="filled" size="sm">Approve</Button>
                      <Button variant="outlined" size="sm" style={{ borderColor: 'var(--bo-error)', color: 'var(--bo-error)' }}>Reject</Button>
                    </div>
                  </div>
                </Card>
              )}

              {isFailed && run?.failureReason && (
                <div style={failureBox}>{run.failureReason}</div>
              )}

              {deployResult?.ok && (
                <Card variant="raised">
                  <span style={{ fontSize: 'var(--bo-text-sm)', color: 'var(--bo-success)' }}>
                    Deployed to <a href={deployResult.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--bo-success)', fontWeight: 600 }}>{deployResult.domain}</a>
                  </span>
                </Card>
              )}

              {isReady && (
                <Card variant="raised">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
                    <h3 style={sectionTitle}>Actions</h3>
                    <div style={actionRow}>
                      {hasPreview && (
                        <Button variant="filled" size="sm" onClick={() => setActiveTab('preview')}>Preview</Button>
                      )}
                      <Button variant="filled" size="sm" onClick={handleDeploy} disabled={deploying}>
                        {deploying ? 'Deploying...' : `Deploy to ${project.slug}.byrick.net`}
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              <Card variant="raised">
                <div style={metaGrid}>
                  <div>
                    <div style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Source</div>
                    <div style={{ fontSize: 'var(--bo-text-sm)', color: 'var(--bo-text)' }}>
                      {project.source === 'whatsapp' ? 'WhatsApp' : project.source === 'web' ? 'Web' : 'Import'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Created</div>
                    <div style={{ fontSize: 'var(--bo-text-sm)', color: 'var(--bo-text)' }}>{timeAgo(project.createdAt)}</div>
                  </div>
                </div>
              </Card>

              <div style={{ display: 'flex', gap: 'var(--bo-space-3)' }}>
                <StatCard label="Files" value={files.filter((f: any) => !f.isDir).length} />
                <StatCard label="Steps" value={run?.steps?.length || 0} />
                <StatCard label="Status" value={project.status.replace(/_/g, ' ')} />
              </div>

              {timelineEntries.length > 0 && (
                <div>
                  <h2 style={sectionTitle}>Pipeline</h2>
                  <Timeline entries={timelineEntries} />
                </div>
              )}
            </div>
          )}

          {activeTab === 'files' && (
            <Card variant="raised">
              <h3 style={sectionTitle}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Folder size={15} /> Files
                </span>
              </h3>
              {files.length === 0 ? (
                <p style={summaryText}>No files generated yet.</p>
              ) : (
                <div style={fileTree}>
                  {files.map((file: any, i: number) => (
                    <div key={i} style={{ ...fileItem, paddingLeft: `${(file.path.split('/').length - 1) * 16}px` }}>
                      {file.isDir ? (
                        <Folder size={13} color="var(--bo-accent)" />
                      ) : (
                        <File size={13} color="var(--bo-text-tertiary)" />
                      )}
                      <span style={{ color: file.isDir ? 'var(--bo-accent)' : 'var(--bo-text)' }}>
                        {file.path.split('/').pop()}{file.isDir ? '/' : ''}
                      </span>
                      {!file.isDir && file.size > 0 && (
                        <span style={{ color: 'var(--bo-text-tertiary)', fontSize: 'var(--bo-text-xs)' }}>
                          {formatSize(file.size)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {activeTab === 'preview' && (
            <div style={{ maxWidth: '960px' }}>
              <div style={previewActions}>
                <h3 style={sectionTitle}>Live Preview</h3>
                {!previewRunning && hasPreview && (
                  <Button variant="filled" size="sm" onClick={startPreview}>Start Preview</Button>
                )}
                {previewRunning && (
                  <Button variant="filled" size="sm" onClick={handleDeploy} disabled={deploying}>
                    {deploying ? 'Deploying...' : 'Deploy Live'}
                  </Button>
                )}
              </div>
              {previewRunning && previewUrl ? (
                <iframe src={previewUrl} style={previewFrame} title="Project Preview" />
              ) : hasPreview ? (
                <Card variant="raised"><p style={summaryText}>Preview not started.</p></Card>
              ) : (
                <Card variant="raised"><p style={summaryText}>No preview — build not complete.</p></Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
