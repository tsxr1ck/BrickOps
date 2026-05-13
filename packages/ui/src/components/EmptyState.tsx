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
  width: '64px',
  height: '64px',
  borderRadius: 'var(--bo-radius-xl)',
  background: 'var(--bo-bg-tertiary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--bo-text-tertiary)',
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
        <h3 style={{ fontSize: 'var(--bo-text-lg)', fontWeight: 'var(--bo-weight-semibold)' as any, color: 'var(--bo-text-primary)', marginBottom: 'var(--bo-space-1)' }}>
          {title}
        </h3>
        {description && (
          <p style={{ fontSize: 'var(--bo-text-sm)', color: 'var(--bo-text-tertiary)', maxWidth: '280px', margin: '0 auto' }}>
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
