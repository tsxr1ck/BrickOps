import type { CSSProperties, ReactNode } from 'react';

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--bo-space-12) var(--bo-space-6)',
  gap: 'var(--bo-space-4)',
  textAlign: 'center',
};

const iconWrapStyle: CSSProperties = {
  width: '56px',
  height: '56px',
  borderRadius: 'var(--bo-radius-md)',
  background: 'var(--bo-bg-elevated)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--bo-text-tertiary)',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--bo-text-lg)',
  fontWeight: 'var(--bo-weight-semibold)',
  color: 'var(--bo-text)',
  marginBottom: 'var(--bo-space-1)',
};

const descStyle: CSSProperties = {
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-text-secondary)',
  maxWidth: '280px',
  margin: '0 auto',
  lineHeight: '1.5',
};

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={containerStyle}>
      {icon && <div style={iconWrapStyle}>{icon}</div>}
      <div>
        <h3 style={titleStyle}>{title}</h3>
        {description && <p style={descStyle}>{description}</p>}
      </div>
      {action}
    </div>
  );
}
