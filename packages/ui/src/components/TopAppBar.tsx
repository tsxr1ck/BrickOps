import { type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

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
  minWidth: 0,
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
  fontSize: 'var(--bo-title)',
  fontWeight: 700,
  color: 'var(--bo-text)',
  textDecoration: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-2)',
  letterSpacing: '-0.3px',
  whiteSpace: 'nowrap',
};

const subtitleStyle: CSSProperties = {
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-text-secondary)',
  fontWeight: 400,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '260px',
};

const backButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: 'var(--bo-radius-sm)',
  color: 'var(--bo-text-secondary)',
  transition: 'all var(--bo-transition-fast)',
  flexShrink: 0,
};

interface TopAppBarProps {
  backTo?: string;
  subtitle?: string;
  center?: ReactNode;
  actions?: ReactNode;
  style?: CSSProperties;
}

export function TopAppBar({ backTo, subtitle, center, actions, style }: TopAppBarProps) {
  const backHref = backTo || '/';
  return (
    <header style={{ ...barStyle, ...style }}>
      <div style={leftStyle}>
        {backTo && (
          <Link to={backHref} style={backButtonStyle} aria-label="Go back">
            <ArrowLeft size={16} />
          </Link>
        )}
        <Link to="/" style={logoStyle}>
          <span style={{ color: 'var(--bo-accent)' }}>◆</span>
          BrickOps
        </Link>
        {subtitle && <span style={subtitleStyle}>{subtitle}</span>}
      </div>
      {center && <div style={centerStyle}>{center}</div>}
      {actions && <div style={rightStyle}>{actions}</div>}
    </header>
  );
}
