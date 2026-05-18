import { type CSSProperties, type ReactNode } from 'react';

const barStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 'var(--bo-z-sticky)',
  height: 'var(--bo-header-height)',
  display: 'flex',
  alignItems: 'center',
  padding: '0 var(--bo-space-4)',
  background: 'var(--bo-bg)',
  borderBottom: '1px solid var(--bo-border)',
  gap: 'var(--bo-space-3)',
};

const leftStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-3)',
  flex: '0 0 auto',
};

const centerStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 0,
};

const rightStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-2)',
  flex: '0 0 auto',
};

const logoStyle: CSSProperties = {
  fontSize: 'var(--bo-text-lg)',
  fontWeight: 700,
  color: 'var(--bo-text)',
  textDecoration: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-2)',
  letterSpacing: '-0.3px',
};

interface TopAppBarProps {
  logo?: ReactNode;
  title?: string;
  center?: ReactNode;
  actions?: ReactNode;
  style?: CSSProperties;
}

export function TopAppBar({ logo, title, center, actions, style }: TopAppBarProps) {
  return (
    <header style={{ ...barStyle, ...style }}>
      <div style={leftStyle}>
        <a href="/" style={logoStyle}>
          {logo ?? <span style={{ color: 'var(--bo-accent)' }}>◆</span>}
          {title ?? 'BrickOps'}
        </a>
      </div>
      {center && <div style={centerStyle}>{center}</div>}
      {actions && <div style={rightStyle}>{actions}</div>}
    </header>
  );
}
