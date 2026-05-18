import { type CSSProperties, type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

const cardStyle: CSSProperties = {
  background: 'var(--bo-bg-surface)',
  borderRadius: 'var(--bo-radius-md)',
  border: '1px solid var(--bo-border)',
  padding: 'var(--bo-space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-3)',
  textDecoration: 'none',
  color: 'inherit',
  transition: 'transform var(--bo-transition-fast), box-shadow var(--bo-transition-fast), border-color var(--bo-transition-fast)',
  cursor: 'pointer',
  height: '100%',
};

const titleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--bo-space-2)',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--bo-title-small)',
  fontWeight: 'var(--bo-title-weight)',
  color: 'var(--bo-text)',
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const metaStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--bo-space-2)',
  fontSize: 'var(--bo-text-xs)',
  color: 'var(--bo-text-secondary)',
  marginTop: 'auto',
  paddingTop: 'var(--bo-space-3)',
  borderTop: '1px solid var(--bo-border)',
};

const descStyle: CSSProperties = {
  fontSize: 'var(--bo-body-small)',
  color: 'var(--bo-text-secondary)',
  lineHeight: '1.5',
  margin: 0,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  flex: 1,
};

const attentionStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: 'var(--bo-text-xs)',
  color: 'var(--bo-warning)',
  fontWeight: 'var(--bo-weight-medium)',
};

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string;
  status?: string;
  updatedAt?: string;
  source?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  href?: string;
  needsAttention?: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function ProjectCard({ id, name, description, updatedAt, source, icon, badge, href, needsAttention: attention }: ProjectCardProps) {
  const [hover, setHover] = useState(false);
  const to = href || `/project/${id}`;

  return (
    <Link
      to={to}
      style={{
        ...cardStyle,
        ...(hover ? { transform: 'translateY(-1px)', boxShadow: 'var(--bo-shadow-md)', borderColor: 'var(--bo-accent-border)' } : {}),
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={titleRowStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-2)', overflow: 'hidden' }}>
          {icon && <span style={{ display: 'flex', color: 'var(--bo-accent)', flexShrink: 0 }}>{icon}</span>}
          <h3 style={titleStyle} title={name}>{name}</h3>
        </div>
        {badge}
      </div>
      {description && <p style={descStyle}>{description}</p>}
      <div style={metaStyle}>
        <span>
          {source === 'whatsapp' ? '📱' : source === 'web' ? '🌐' : '📦'}
          {' '}{updatedAt ? timeAgo(updatedAt) : ''}
        </span>
        {attention && (
          <span style={attentionStyle}>
            <AlertCircle size={14} /> Attention
          </span>
        )}
      </div>
    </Link>
  );
}
