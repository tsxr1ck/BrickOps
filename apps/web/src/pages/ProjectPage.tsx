import { useParams, Link } from 'react-router-dom';
import { Card, Badge, Button, Timeline, EmptyState } from '@brickops/ui';
import type { TimelineEntry } from '@brickops/ui';
import { ArrowLeft, ExternalLink, AlertTriangle, Folder, File, Play, Rocket, MessageSquare, Monitor } from 'lucide-react';
import { useProject, useWorkspaceFiles, useWorkspaceInfo, usePreviewStatus } from '../hooks/useProjects';
import { timeAgo } from '../data/mock';
import { useState } from 'react';
import type { CSSProperties } from 'react';

const API_BASE = 'http://localhost:3001';

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-4)',
};

const backLink: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--bo-space-2)',
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-text-secondary)',
  textDecoration: 'none',
  marginBottom: 'var(--bo-space-1)',
};

const headerSection: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-2)',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--bo-text-2xl)',
  fontWeight: 'var(--bo-weight-bold)' as any,
  color: 'var(--bo-text-primary)',
  letterSpacing: '-0.5px',
};

const sectionTitle: CSSProperties = {
  fontSize: 'var(--bo-text-base)',
  fontWeight: 'var(--bo-weight-semibold)' as any,
  color: 'var(--bo-text-primary)',
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

const metaItem: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const metaLabel: CSSProperties = {
  fontSize: 'var(--bo-text-xs)',
  color: 'var(--bo-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const metaValue: CSSProperties = {
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-text-primary)',
  fontWeight: 'var(--bo-weight-medium)' as any,
};

const failureBox: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--bo-space-3)',
  padding: 'var(--bo-space-3) var(--bo-space-4)',
  background: 'var(--bo-error-bg)',
  borderRadius: 'var(--bo-radius-md)',
  border: '1px solid var(--bo-error)',
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-error)',
  lineHeight: '1.4',
};

const tabRow: CSSProperties = {
  display: 'flex',
  gap: '2px',
  borderBottom: '1px solid var(--bo-border)',
  marginBottom: 'var(--bo-space-3)',
};

const tabStyle = (active: boolean): CSSProperties => ({
  padding: 'var(--bo-space-2) var(--bo-space-4)',
  fontSize: 'var(--bo-text-sm)',
  fontWeight: active ? ('var(--bo-weight-semibold)' as any) : 'normal',
  color: active ? 'var(--bo-accent)' : 'var(--bo-text-secondary)',
  background: 'none',
  border: 'none',
  borderBottom: active ? '2px solid var(--bo-accent)' : '2px solid transparent',
  cursor: 'pointer',
});

const fileTree: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 'var(--bo-text-sm)',
  lineHeight: '1.8',
  color: 'var(--bo-text-primary)',
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
  borderRadius: 'var(--bo-radius-md)',
  background: '#fff',
};

const deploySuccess: CSSProperties = {
  padding: 'var(--bo-space-3) var(--bo-space-4)',
  background: 'var(--bo-success-bg, #064e3b)',
  borderRadius: 'var(--bo-radius-md)',
  border: '1px solid var(--bo-success, #10b981)',
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-success, #10b981)',
};

export function ProjectPage() {
  const { slug } = useParams<{ slug: string }>();
  const { project, run } = useProject(slug || '');
  const { files } = useWorkspaceFiles(project?.id || '');
  const { workspace } = useWorkspaceInfo(project?.id || '');
  const { previewUrl, previewRunning, startPreview } = usePreviewStatus(project?.id || '');
  const [activeTab, setActiveTab] = useState<'overview' | 'files' | 'preview' | 'chat'>('overview');
  const [deployResult, setDeployResult] = useState<any>(null);
  const [deploying, setDeploying] = useState(false);

  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        description="This project doesn't exist or has been deleted."
        action={<Link to="/" style={backLink}>← Back to projects</Link>}
      />
    );
  }

  const isAwaiting = project.status.includes('awaiting') || project.status.includes('pending');
  const isFailed = project.status === 'failed';
  const isReady = project.status === 'ready_to_deploy' || project.status === 'deployed';
  const hasPreview = workspace?.hasDist;

  const timelineEntries: TimelineEntry[] = run
    ? run.steps.map((step) => ({
        id: step.id,
        title: step.name,
        timestamp: step.startedAt ? timeAgo(step.startedAt) : '—',
        status: step.status,
        description: step.status === 'failed' && run.failureReason ? run.failureReason : undefined,
      }))
    : [];

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${project.id}/deploy`, { method: 'POST' });
      const data = await res.json();
      setDeployResult(data);
    } catch (err: any) {
      setDeployResult({ error: err.message });
    }
    setDeploying(false);
  };

  return (
    <div style={pageStyle}>
      {/* Back nav */}
      <Link to="/" style={backLink}>
        <ArrowLeft size={16} /> Projects
      </Link>

      {/* Header */}
      <div style={headerSection}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-3)' }}>
          <h1 style={titleStyle}>{project.name}</h1>
          <Badge status={project.status} />
        </div>
      </div>

      {/* Tabs */}
      <div style={tabRow}>
        <button style={tabStyle(activeTab === 'overview')} onClick={() => setActiveTab('overview')}>
          Overview
        </button>
        <button style={tabStyle(activeTab === 'files')} onClick={() => setActiveTab('files')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <File size={14} /> Files {files.length > 0 && `(${files.filter(f => !f.isDir).length})`}
          </span>
        </button>
        <button style={tabStyle(activeTab === 'preview')} onClick={() => setActiveTab('preview')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Monitor size={14} /> Preview
          </span>
        </button>
        <button style={tabStyle(activeTab === 'chat')} onClick={() => setActiveTab('chat')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MessageSquare size={14} /> Modify
          </span>
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Primary Action Block */}
          {isAwaiting && (
            <Card variant="approval">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
                <span style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 'var(--bo-weight-semibold)' as any, color: 'var(--bo-warning)' }}>
                  ⏳ Waiting for your approval
                </span>
                <div style={actionRow}>
                  <Button variant="primary" size="md">✓ Approve</Button>
                  <Button variant="danger" size="md">✕ Reject</Button>
                </div>
              </div>
            </Card>
          )}

          {/* Failure banner */}
          {isFailed && run?.failureReason && (
            <div style={failureBox}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{run.failureReason}</span>
            </div>
          )}

          {/* Deploy Success */}
          {deployResult?.ok && (
            <div style={deploySuccess}>
              ✅ Deployed to <a href={deployResult.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', fontWeight: 'bold' }}>{deployResult.domain}</a>
            </div>
          )}

          {/* Actions */}
          {isReady && (
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
                <h3 style={sectionTitle}>Actions</h3>
                <div style={actionRow}>
                  {hasPreview && (
                    <Button variant="primary" size="md" onClick={() => setActiveTab('preview')}>
                      <Play size={14} /> Preview
                    </Button>
                  )}
                  <Button variant="primary" size="md" onClick={handleDeploy} disabled={deploying}>
                    <Rocket size={14} /> {deploying ? 'Deploying...' : `Deploy to ${project.slug}.byrick.net`}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Meta */}
          <Card>
            <div style={metaGrid}>
              <div style={metaItem}>
                <span style={metaLabel}>Source</span>
                <span style={metaValue}>
                  {project.source === 'whatsapp' ? '📱 WhatsApp' : project.source === 'web' ? '🌐 Web' : '📦 Import'}
                </span>
              </div>
              <div style={metaItem}>
                <span style={metaLabel}>Created</span>
                <span style={metaValue}>{timeAgo(project.createdAt)}</span>
              </div>
              <div style={metaItem}>
                <span style={metaLabel}>Workspace</span>
                <span style={{ ...metaValue, fontFamily: 'monospace', fontSize: 'var(--bo-text-xs)' }}>
                  ~/.brickops/workspaces/{project.id.slice(0, 12)}...
                </span>
              </div>
              {workspace?.hasDist && (
                <div style={metaItem}>
                  <span style={metaLabel}>Build</span>
                  <span style={{ ...metaValue, color: 'var(--bo-success, #10b981)' }}>✓ dist/ ready</span>
                </div>
              )}
            </div>
          </Card>

          {/* Timeline */}
          {timelineEntries.length > 0 && (
            <div>
              <h2 style={sectionTitle}>Pipeline Timeline</h2>
              <Timeline entries={timelineEntries} />
            </div>
          )}
        </>
      )}

      {/* Files Tab */}
      {activeTab === 'files' && (
        <Card>
          <h3 style={sectionTitle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Folder size={16} /> Workspace Files
            </span>
          </h3>
          {files.length === 0 ? (
            <p style={summaryText}>No files generated yet.</p>
          ) : (
            <div style={fileTree}>
              {files.map((file, i) => (
                <div key={i} style={{ ...fileItem, paddingLeft: `${(file.path.split('/').length - 1) * 16}px` }}>
                  {file.isDir ? (
                    <Folder size={14} style={{ color: 'var(--bo-accent)' }} />
                  ) : (
                    <File size={14} style={{ color: 'var(--bo-text-tertiary)' }} />
                  )}
                  <span style={{ color: file.isDir ? 'var(--bo-accent)' : 'var(--bo-text-primary)' }}>
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

      {/* Preview Tab */}
      {activeTab === 'preview' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--bo-space-3)' }}>
            <h3 style={sectionTitle}>Live Preview</h3>
            {!previewRunning && hasPreview && (
              <Button variant="primary" size="sm" onClick={startPreview}>
                <Play size={14} /> Start Preview
              </Button>
            )}
            {previewRunning && (
              <Button variant="primary" size="sm" onClick={handleDeploy} disabled={deploying}>
                <Rocket size={14} /> {deploying ? 'Deploying...' : 'Deploy Live'}
              </Button>
            )}
          </div>
          {previewRunning && previewUrl ? (
            <iframe src={previewUrl} style={previewFrame} title="Project Preview" />
          ) : hasPreview ? (
            <Card>
              <p style={summaryText}>Preview not started. Click "Start Preview" above.</p>
            </Card>
          ) : (
            <Card>
              <p style={summaryText}>No preview available — build hasn't completed yet.</p>
            </Card>
          )}
        </div>
      )}

      {/* Modify Tab */}
      {activeTab === 'chat' && (
        <Card>
          <h3 style={sectionTitle}>Request Changes</h3>
          <p style={summaryText}>
            Send a modification request via WhatsApp to update this project.
          </p>
          <div style={{ marginTop: 'var(--bo-space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-2)' }}>
            <p style={{ ...summaryText, fontStyle: 'italic' }}>
              Example: "Add a settings page" or "Fix the header styling"
            </p>
            <p style={summaryText}>
              💬 Send your request to the WhatsApp bot and it will be processed automatically.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
