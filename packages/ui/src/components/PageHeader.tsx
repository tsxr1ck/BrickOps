import { type CSSProperties, type ReactNode } from 'react';

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-1)',
};

const titleRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--bo-space-3)',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--bo-text-2xl)',
  fontWeight: 700,
  color: 'var(--bo-text)',
  letterSpacing: '-0.5px',
  margin: 0,
};

const subtitleStyle: CSSProperties = {
  fontSize: 'var(--bo-text-base)',
  color: 'var(--bo-text-secondary)',
  margin: 0,
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-2)',
  flexShrink: 0,
};

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div style={headerStyle}>
      <div style={titleRow}>
        <h1 style={titleStyle}>{title}</h1>
        {actions && <div style={actionsStyle}>{actions}</div>}
      </div>
      {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
    </div>
  );
}
