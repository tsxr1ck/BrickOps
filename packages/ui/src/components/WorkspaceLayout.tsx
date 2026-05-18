import { type CSSProperties, type ReactNode, useState, useEffect } from 'react';
import { PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const containerStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
  height: '100%',
};

const sidebarStyle = (collapsed: boolean): CSSProperties => ({
  width: collapsed ? '0px' : '280px',
  flexShrink: 0,
  borderRight: collapsed ? 'none' : '1px solid var(--bo-border)',
  background: 'var(--bo-bg)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  transition: 'width var(--bo-transition-normal)',
});

const mainStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  minWidth: 0,
};

const asideStyle = (collapsed: boolean): CSSProperties => ({
  width: collapsed ? '0px' : '360px',
  flexShrink: 0,
  borderLeft: collapsed ? 'none' : '1px solid var(--bo-border)',
  background: 'var(--bo-bg-surface)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  transition: 'width var(--bo-transition-normal)',
});

const gutterStyle: CSSProperties = {
  width: '20px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: 'var(--bo-space-3)',
  cursor: 'pointer',
  color: 'var(--bo-text-tertiary)',
  transition: 'color var(--bo-transition-fast)',
};

interface WorkspaceLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  aside?: ReactNode;
}

export function WorkspaceLayout({ sidebar, main, aside }: WorkspaceLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [asideCollapsed, setAsideCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (isMobile) {
    return (
      <div style={{ ...containerStyle, flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>{main}</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={sidebarStyle(sidebarCollapsed)}>
        {!sidebarCollapsed && <div style={{ overflow: 'auto', flex: 1 }}>{sidebar}</div>}
      </div>

      <div
        style={gutterStyle}
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--bo-text-secondary)'}
        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--bo-text-tertiary)'}
      >
        {sidebarCollapsed ? <PanelRightOpen size={13} /> : <PanelRightClose size={13} />}
      </div>

      <div style={mainStyle}>
        {main}
      </div>

      {aside && (
        <>
          <div
            style={gutterStyle}
            onClick={() => setAsideCollapsed(!asideCollapsed)}
            title={asideCollapsed ? 'Show aside' : 'Hide aside'}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--bo-text-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--bo-text-tertiary)'}
          >
            {asideCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
          </div>
          <div style={asideStyle(asideCollapsed)}>
            {!asideCollapsed && <div style={{ overflow: 'auto', flex: 1 }}>{aside}</div>}
          </div>
        </>
      )}
    </div>
  );
}
