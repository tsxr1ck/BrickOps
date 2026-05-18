import { type CSSProperties, type ReactNode, useState } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { StepperSidebar } from './StepperSidebar';
import type { StepperStep } from './StepperSidebar';

const containerStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
  height: '100%',
};

const sidebarStyle: CSSProperties = {
  width: '240px',
  flexShrink: 0,
  borderRight: '1px solid var(--bo-border)',
  background: 'var(--bo-bg)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  transition: 'width var(--bo-transition-normal)',
};

const sidebarHeader: CSSProperties = {
  padding: 'var(--bo-space-3) var(--bo-space-4)',
  borderBottom: '1px solid var(--bo-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const chatArea: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: 'var(--bo-bg-raised)',
};

const messagesContainer: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-3)',
  padding: 'var(--bo-space-4)',
};

const inputAreaStyle: CSSProperties = {
  padding: 'var(--bo-space-3) var(--bo-space-4)',
  borderTop: '1px solid var(--bo-border)',
  background: 'var(--bo-bg)',
};

const iconBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: 'var(--bo-radius-sm)',
  color: 'var(--bo-text-tertiary)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  transition: 'all var(--bo-transition-fast)',
};

interface WorkspaceLayoutProps {
  steps: StepperStep[];
  messages: ReactNode;
  inputArea: ReactNode;
  sidebarTop?: ReactNode;
}

export function WorkspaceLayout({ steps, messages, inputArea, sidebarTop }: WorkspaceLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div style={containerStyle}>
      <div style={{ ...sidebarStyle, width: sidebarCollapsed ? '0px' : '240px', borderRight: sidebarCollapsed ? 'none' : undefined }}>
        {sidebarTop && <div style={sidebarHeader}>{sidebarTop}</div>}
        {!sidebarCollapsed && (
          <>
            <div style={sidebarHeader}>
              <span style={{ fontSize: 'var(--bo-text-xs)', fontWeight: 600, color: 'var(--bo-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Pipeline
              </span>
              <button
                style={iconBtn}
                onClick={() => setSidebarCollapsed(true)}
                aria-label="Collapse"
              >
                <PanelRightClose size={14} />
              </button>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              <StepperSidebar steps={steps} />
            </div>
          </>
        )}
      </div>

      {sidebarCollapsed && (
        <button
          style={{
            ...iconBtn,
            position: 'absolute' as const,
            left: '6px',
            top: 'calc(var(--bo-header-height) + 6px)',
            zIndex: 10,
            background: 'var(--bo-bg-elevated)',
            boxShadow: 'var(--bo-shadow-sm)',
          }}
          onClick={() => setSidebarCollapsed(false)}
          aria-label="Expand"
        >
          <PanelRightOpen size={14} />
        </button>
      )}

      <div style={chatArea}>
        <div style={messagesContainer}>{messages}</div>
        <div style={inputAreaStyle}>{inputArea}</div>
      </div>
    </div>
  );
}
