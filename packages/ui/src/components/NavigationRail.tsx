import { type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

const railStyle: CSSProperties = {
  width: 'var(--bo-nav-rail-width)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: 'var(--bo-space-2) 0',
  gap: '2px',
  background: 'var(--bo-bg)',
  borderRight: '1px solid var(--bo-border)',
  flexShrink: 0,
  overflowY: 'auto',
};

const itemStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '3px',
  padding: 'var(--bo-space-2) 0',
  width: '52px',
  borderRadius: 'var(--bo-radius-md)',
  color: active ? 'var(--bo-accent)' : 'var(--bo-text-tertiary)',
  background: active ? 'var(--bo-accent-bg)' : 'transparent',
  textDecoration: 'none',
  fontSize: 'var(--bo-text-xs)',
  fontWeight: active ? 600 : 400,
  transition: 'all var(--bo-transition-fast)',
  cursor: 'pointer',
});

export interface NavRailItem {
  path: string;
  label: string;
  icon: ReactNode;
  matchFn?: (pathname: string) => boolean;
}

interface NavigationRailProps {
  items: NavRailItem[];
}

export function NavigationRail({ items }: NavigationRailProps) {
  const location = useLocation();

  return (
    <nav style={railStyle}>
      {items.map((item) => {
        const isActive = item.matchFn
          ? item.matchFn(location.pathname)
          : location.pathname === item.path;
        return (
          <Link key={item.path} to={item.path} style={itemStyle(isActive)} title={item.label}>
            <span style={{ display: 'flex' }}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
