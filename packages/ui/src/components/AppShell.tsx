import { type CSSProperties, type ReactNode, useState, useEffect } from 'react';
import { TopAppBar } from './TopAppBar';
import { NavigationRail } from './NavigationRail';
import type { NavRailItem } from './NavigationRail';
import { NavigationBar } from './NavigationBar';
import { FolderKanban, ShieldCheck, Settings, History, Sun, Moon, Smartphone } from 'lucide-react';

const navItems: NavRailItem[] = [
  { path: '/', label: 'Projects', icon: <FolderKanban size={18} />, matchFn: (p) => p === '/' || p.startsWith('/project/') },
  { path: '/approvals', label: 'Approvals', icon: <ShieldCheck size={18} /> },
  { path: '/sessions', label: 'Sessions', icon: <History size={18} /> },
  { path: '/settings', label: 'Settings', icon: <Settings size={18} /> },
];

const layoutStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100dvh',
  background: 'var(--bo-bg)',
};

const bodyStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
};

const mainArea: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  maxHeight: 'calc(100dvh - var(--bo-header-height))',
};

const workspaceStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
};

const contentStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 'var(--bo-space-5)',
};

const previewPanelStyle: CSSProperties = {
  width: '320px',
  flexShrink: 0,
  borderLeft: '1px solid var(--bo-border)',
  background: 'var(--bo-bg-surface)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const iconBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  borderRadius: 'var(--bo-radius-md)',
  color: 'var(--bo-text-secondary)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  transition: 'all var(--bo-transition-fast)',
};

const channelPill: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '4px',
  padding: '4px 10px', borderRadius: 'var(--bo-radius-sm)',
  background: 'var(--bo-accent-bg)',
  color: 'var(--bo-accent)',
  fontSize: 'var(--bo-text-xs)', fontWeight: 500,
  whiteSpace: 'nowrap',
};

export function getTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('bo-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
}

interface AppShellProps {
  children: ReactNode;
  previewPanel?: ReactNode;
}

export function AppShell({ children, previewPanel }: AppShellProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(getTheme);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bo-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  const renderMobile = () => (
    <>
      <TopAppBar
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-1)' }}>
            <span style={channelPill}><Smartphone size={12} /> + Web</span>
            <button style={iconBtn} onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        }
      />
      <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
      <NavigationBar items={navItems} />
    </>
  );

  const renderDesktop = () => (
    <>
      <TopAppBar
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-1)' }}>
            <span style={channelPill}><Smartphone size={12} /> WhatsApp + Web</span>
            <button style={iconBtn} onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        }
      />
      <div style={bodyStyle}>
        <NavigationRail items={navItems} />
        <div style={mainArea}>
          <div style={workspaceStyle}>
            <div style={contentStyle}>{children}</div>
            {previewPanel && <div style={previewPanelStyle}>{previewPanel}</div>}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div style={layoutStyle}>
      {isMobile ? renderMobile() : renderDesktop()}
    </div>
  );
}
