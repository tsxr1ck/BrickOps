import { type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

const barStyle: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 'var(--bo-z-nav)',
  height: 'var(--bo-bottom-nav-height)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-around',
  background: 'var(--bo-bg)',
  borderTop: '1px solid var(--bo-border)',
  paddingBottom: 'env(safe-area-inset-bottom)',
};

const itemStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px',
  padding: 'var(--bo-space-1) var(--bo-space-3)',
  color: active ? 'var(--bo-accent)' : 'var(--bo-text-tertiary)',
  textDecoration: 'none',
  fontSize: 'var(--bo-text-xs)',
  fontWeight: active ? 600 : 400,
  transition: 'color var(--bo-transition-fast)',
  WebkitTapHighlightColor: 'transparent',
  minWidth: 'var(--bo-tap-target)',
  minHeight: 'var(--bo-tap-target)',
  justifyContent: 'center',
});

export interface NavBarItem {
  path: string;
  label: string;
  icon: ReactNode;
  matchFn?: (pathname: string) => boolean;
}

interface NavigationBarProps {
  items: NavBarItem[];
}

export function NavigationBar({ items }: NavigationBarProps) {
  const location = useLocation();

  return (
    <nav style={barStyle}>
      {items.map((item) => {
        const isActive = item.matchFn
          ? item.matchFn(location.pathname)
          : location.pathname === item.path;
        return (
          <Link key={item.path} to={item.path} style={itemStyle(isActive)}>
            <span style={{ display: 'flex' }}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
