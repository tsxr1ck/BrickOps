import { type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FolderKanban,
  ShieldCheck,
  Plus,
  Settings,
} from 'lucide-react';

/* ─── Nav items ─── */
const navItems = [
  { path: '/', label: 'Projects', icon: FolderKanban },
  { path: '/approvals', label: 'Approvals', icon: ShieldCheck },
  { path: '/new', label: 'New', icon: Plus },
  { path: '/settings', label: 'Settings', icon: Settings },
];

/* ─── Styles ─── */
const shellStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100dvh',
  background: 'var(--bo-bg-primary)',
};

const headerStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 'var(--bo-z-sticky)' as any,
  height: 'var(--bo-header-height)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 var(--bo-space-5)',
  background: 'var(--bo-bg-primary)',
  borderBottom: '1px solid var(--bo-border)',
  backdropFilter: 'blur(12px)',
};

const logoStyle: CSSProperties = {
  fontSize: 'var(--bo-text-lg)',
  fontWeight: 'var(--bo-weight-bold)' as any,
  color: 'var(--bo-text-primary)',
  letterSpacing: '-0.5px',
  textDecoration: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-2)',
};

const mainStyle: CSSProperties = {
  flex: 1,
  width: '100%',
  maxWidth: 'var(--bo-max-width)',
  margin: '0 auto',
  padding: 'var(--bo-space-4) var(--bo-space-4) calc(var(--bo-bottom-nav-height) + var(--bo-space-4))',
};

const bottomNavStyle: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 'var(--bo-z-nav)' as any,
  height: 'var(--bo-bottom-nav-height)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-around',
  background: 'var(--bo-bg-elevated)',
  borderTop: '1px solid var(--bo-border)',
  paddingBottom: 'env(safe-area-inset-bottom)',
};

const navItemStyle = (isActive: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px',
  padding: 'var(--bo-space-1) var(--bo-space-3)',
  borderRadius: 'var(--bo-radius-sm)',
  color: isActive ? 'var(--bo-accent)' : 'var(--bo-text-tertiary)',
  textDecoration: 'none',
  fontSize: 'var(--bo-text-xs)',
  fontWeight: isActive ? ('var(--bo-weight-semibold)' as any) : ('var(--bo-weight-normal)' as any),
  transition: 'color var(--bo-transition-fast)',
  WebkitTapHighlightColor: 'transparent',
  minWidth: 'var(--bo-tap-target)',
  minHeight: 'var(--bo-tap-target)',
  justifyContent: 'center',
});

/* ─── Component ─── */
interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();

  return (
    <div style={shellStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <Link to="/" style={logoStyle}>
          <span style={{ fontSize: '20px' }}>⬡</span>
          BrickOps
        </Link>
      </header>

      {/* Main Content */}
      <main style={mainStyle}>{children}</main>

      {/* Bottom Navigation */}
      <nav style={bottomNavStyle}>
        {navItems.map((item) => {
          const isActive =
            item.path === '/'
              ? location.pathname === '/' || location.pathname.startsWith('/project/')
              : location.pathname === item.path;
          const Icon = item.icon;

          return (
            <Link key={item.path} to={item.path} style={navItemStyle(isActive)}>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
