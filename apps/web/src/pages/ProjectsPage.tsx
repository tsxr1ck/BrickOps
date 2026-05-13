import { useNavigate } from 'react-router-dom';
import { Card, Badge } from '@brickops/ui';
import { Plus, AlertCircle } from 'lucide-react';
import { useProjects } from '../hooks/useProjects';
import { timeAgo } from '../data/mock';
import type { CSSProperties } from 'react';

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-3)',
};

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 'var(--bo-space-2)',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--bo-text-xl)',
  fontWeight: 'var(--bo-weight-bold)' as any,
  color: 'var(--bo-text-primary)',
};

const cardContent: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-2)',
};

const cardTopRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--bo-space-2)',
};

const projectName: CSSProperties = {
  fontSize: 'var(--bo-text-base)',
  fontWeight: 'var(--bo-weight-semibold)' as any,
  color: 'var(--bo-text-primary)',
};

const summaryStyle: CSSProperties = {
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-text-secondary)',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  lineHeight: '1.4',
};

const metaRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--bo-space-2)',
};

const metaText: CSSProperties = {
  fontSize: 'var(--bo-text-xs)',
  color: 'var(--bo-text-tertiary)',
};

const attentionBadge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: 'var(--bo-text-xs)',
  color: 'var(--bo-warning)',
  fontWeight: 'var(--bo-weight-medium)' as any,
};

const fabStyle: CSSProperties = {
  position: 'fixed',
  bottom: 'calc(var(--bo-bottom-nav-height) + var(--bo-space-4))',
  right: 'var(--bo-space-4)',
  width: '56px',
  height: '56px',
  borderRadius: 'var(--bo-radius-full)',
  background: 'var(--bo-accent)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: 'var(--bo-shadow-lg)',
  zIndex: 'var(--bo-z-fab)' as any,
  cursor: 'pointer',
  border: 'none',
  transition: 'transform var(--bo-transition-fast)',
};

const needsAttention = (status: string) =>
  status.includes('awaiting') || status.includes('pending');

export function ProjectsPage() {
  const { projects } = useProjects();
  const navigate = useNavigate();

  return (
    <div style={pageStyle}>
      <div style={headerRow}>
        <h1 style={titleStyle}>Projects</h1>
        <span style={metaText}>{projects.length} total</span>
      </div>

      {projects.map((p) => (
        <Card
          key={p.id}
          variant="interactive"
          onClick={() => navigate(`/project/${p.slug}`)}
          id={`project-card-${p.slug}`}
        >
          <div style={cardContent}>
            <div style={cardTopRow}>
              <span style={projectName}>{p.name}</span>
              <Badge status={p.status} />
            </div>

            <p style={summaryStyle}>{p.summary}</p>

            <div style={metaRow}>
              <span style={metaText}>
                {p.source === 'whatsapp' ? '📱' : p.source === 'web' ? '🌐' : '📦'}{' '}
                {timeAgo(p.updatedAt)}
              </span>
              {needsAttention(p.status) && (
                <span style={attentionBadge}>
                  <AlertCircle size={12} /> Needs attention
                </span>
              )}
            </div>
          </div>
        </Card>
      ))}

      <button
        style={fabStyle}
        onClick={() => navigate('/new')}
        aria-label="Create new project"
        id="fab-new-project"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
