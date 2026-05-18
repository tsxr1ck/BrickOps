import { type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, FileTree } from '@brickops/ui';
import { Square, ArrowLeft } from 'lucide-react';

const section: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-3)',
  padding: 'var(--bo-space-3)',
};

const sectionTitle: CSSProperties = {
  fontSize: 'var(--bo-text-xs)',
  fontWeight: 600,
  color: 'var(--bo-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const label: CSSProperties = {
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-text)',
  fontWeight: 500,
};

const meta: CSSProperties = {
  fontSize: 'var(--bo-text-xs)',
  color: 'var(--bo-text-tertiary)',
};

const statusDot: CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
};

interface ProjectSidebarProps {
  project: any;
  runStatus: string;
  connected: boolean;
  sessionId: string | null;
  files: any[];
  selectedFile: string | null;
  onFileSelect: (path: string) => void;
  onCancelRun: () => void;
  projectStatus?: string | null;
  pipelineActive?: boolean;
}

export function ProjectSidebar({ project, runStatus, connected, sessionId, files, selectedFile, onFileSelect, onCancelRun, projectStatus, pipelineActive }: ProjectSidebarProps) {
  return (
    <div style={section}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-2)', marginBottom: 'var(--bo-space-2)' }}>
        <Link to="/" style={{ display: 'flex', color: 'var(--bo-text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <span style={label}>{project.name}</span>
        <Badge status={project.status} />
      </div>

      <div>
        <div style={sectionTitle}>Status</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: 'var(--bo-space-1)' }}>
          <span style={{ ...statusDot, background: runStatus === 'running' ? 'var(--bo-accent)' : runStatus === 'error' ? 'var(--bo-error)' : 'var(--bo-success)' }} />
          <span style={meta}>{runStatus === 'running' ? 'Running' : runStatus === 'error' ? 'Error' : 'Idle'}</span>
          {connected && <span style={{ ...meta, color: 'var(--bo-success)' }}>• Live</span>}
        </div>
        {projectStatus && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <span style={{ ...statusDot, background: pipelineActive ? '#f59e0b' : 'var(--bo-success)' }} />
            <span style={meta}>{projectStatus.replace(/_/g, ' ')}</span>
          </div>
        )}
      </div>

      {runStatus === 'running' && (
        <Button variant="outlined" size="sm" onClick={onCancelRun} style={{ borderColor: 'var(--bo-error)', color: 'var(--bo-error)' }}>
          <Square size={12} /> Cancel
        </Button>
      )}

      <div>
        <div style={sectionTitle}>Session</div>
        <div style={meta}>{sessionId?.slice(0, 30)}...</div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ ...sectionTitle, padding: 'var(--bo-space-2) var(--bo-space-3)' }}>
          Files ({files.filter((f: any) => !f.isDir).length})
        </div>
        <FileTree
          files={files}
          selectedFile={selectedFile}
          onFileSelect={onFileSelect}
        />
      </div>
    </div>
  );
}
