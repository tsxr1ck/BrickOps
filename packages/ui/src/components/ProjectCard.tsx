import { type CSSProperties, type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusDot } from './StatusDot';

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
};

const titleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--bo-space-2)',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--bo-text-base)',
  fontWeight: 600,
  color: 'var(--bo-text)',
  margin: 0,
};

const metaStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-3)',
  fontSize: 'var(--bo-text-xs)',
  color: 'var(--bo-text-secondary)',
};

const descStyle: CSSProperties = {
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-text-secondary)',
  lineHeight: '1.5',
  margin: 0,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string;
  status?: string;
  updatedAt?: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export function ProjectCard({ id, name, description, status, updatedAt, icon, badge }: ProjectCardProps) {
  const [hover, setHover] = useState(false);

  return (
    <Link
      to={`/project/${id}`}
      style={{
        ...cardStyle,
        ...(hover ? { transform: 'translateY(-1px)', boxShadow: 'var(--bo-shadow-md)', borderColor: 'var(--bo-accent-border)' } : {}),
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={titleRowStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-2)' }}>
          {icon && <span style={{ display: 'flex', color: 'var(--bo-accent)' }}>{icon}</span>}
          <h3 style={titleStyle}>{name}</h3>
        </div>
        {badge}
      </div>
      {description && <p style={descStyle}>{description}</p>}
      <div style={metaStyle}>
        {status && <StatusDot status={status as any} />}
        {updatedAt && <span>{updatedAt}</span>}
      </div>
    </Link>
  );
}
