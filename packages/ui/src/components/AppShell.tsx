import { type CSSProperties, type ReactNode, useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { TopAppBar } from './TopAppBar';
import { NavigationRail } from './NavigationRail';
import type { NavRailItem } from './NavigationRail';
import { NavigationBar } from './NavigationBar';
import { PageTitleContext, type PageTitleValue } from './PageTitleContext';
import { FolderKanban, ShieldCheck, Settings, History, Sun, Moon, Smartphone } from 'lucide-react';

const navItems: NavRailItem[] = [
  { path: '/', label: 'Projects', icon: <FolderKanban size={18} />, matchFn: (p) => p === '/' || p.startsWith('/project/') },
  { path: '/approvals', label: 'Approvals', icon: <ShieldCheck size={18} /> },
  { path: '/sessions', label: 'Sessions', icon: <History size={18} /> },
  { path: '/settings', label: 'Settings', icon: <Settings size={18} /> },
];

function getRouteMeta(pathname: string): PageTitleValue {
  if (pathname === '/') return { title: 'Projects' };
  if (pathname.startsWith('/project/')) return { title: 'Workspace', backTo: '/' };
  if (pathname.startsWith('/approvals')) return { title: 'Approvals' };
  if (pathname.startsWith('/sessions')) return { title: 'Sessions' };
  if (pathname.startsWith('/settings')) return { title: 'Settings' };
  if (pathname.startsWith('/new')) return { title: 'New Project', backTo: '/' };
  return { title: '' };
}

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
  maxHeight: 'calc(100dvh - var(--bo-header-height))',
};

const mainArea: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  overflow: 'hidden',
};

const contentStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 'var(--bo-space-5)',
};

const iconBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '34px',
  height: '34px',
  borderRadius: 'var(--bo-radius-md)',
  color: 'var(--bo-text-secondary)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  transition: 'all var(--bo-transition-fast)',
};

const channelPill: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '4px',
  padding: '3px 8px', borderRadius: 'var(--bo-radius-sm)',
  background: 'var(--bo-accent-bg)',
  color: 'var(--bo-accent)',
  fontSize: 'var(--bo-text-xs)', fontWeight: 500,
  whiteSpace: 'nowrap',
};

const productNameStyle: CSSProperties = {
  fontSize: 'var(--bo-text-base)',
  fontWeight: 700,
  color: 'var(--bo-text)',
  letterSpacing: '-0.3px',
  marginRight: 'var(--bo-space-3)',
};

export function getTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('bo-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
}

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(getTheme);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [pageTitle, setPageTitleState] = useState<PageTitleValue>({ title: '' });
  const location = useLocation();

  useEffect(() => {
    setPageTitleState(getRouteMeta(location.pathname));
  }, [location.pathname]);

  const setPageTitle = useCallback((t: PageTitleValue) => {
    setPageTitleState(t);
  }, []);

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

  const ctxValue = useMemo(() => ({ pageTitle, setPageTitle }), [pageTitle, setPageTitle]);

  const topBarActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-1)' }}>
      <span style={channelPill}><Smartphone size={11} /> WhatsApp + Web</span>
      <button style={iconBtn} onClick={toggleTheme} aria-label="Toggle theme">
        {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
      </button>
    </div>
  );

  const productName = (
    <span style={productNameStyle}>BrickOps</span>
  );

  const renderMobile = () => (
    <>
      <TopAppBar
        backTo={pageTitle.backTo}
        subtitle={pageTitle.backTo ? pageTitle.title : undefined}
        actions={topBarActions}
      />
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 'var(--bo-bottom-nav-height)' }}>{children}</div>
      <NavigationBar items={navItems} />
    </>
  );

  const renderDesktop = () => (
    <>
      <TopAppBar
        backTo={pageTitle.backTo}
        subtitle={pageTitle.backTo ? pageTitle.title : undefined}
        center={pageTitle.backTo ? undefined : productName}
        actions={topBarActions}
      />
      <div style={bodyStyle}>
        <NavigationRail items={navItems} />
        <div style={mainArea}>
          <div style={contentStyle}>{children}</div>
        </div>
      </div>
    </>
  );

  return (
    <PageTitleContext.Provider value={ctxValue}>
      <div style={layoutStyle}>
        {isMobile ? renderMobile() : renderDesktop()}
      </div>
    </PageTitleContext.Provider>
  );
}
