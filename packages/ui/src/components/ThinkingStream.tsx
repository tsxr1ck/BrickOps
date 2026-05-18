import { type CSSProperties, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Brain } from 'lucide-react';

export interface ThinkingStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

const containerStyle: CSSProperties = {
  background: 'var(--bo-bg-raised)',
  borderRadius: 'var(--bo-radius-md)',
  border: '1px solid var(--bo-border)',
  overflow: 'hidden',
};

const headerStyle = (collapsed: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-2)',
  padding: 'var(--bo-space-2) var(--bo-space-3)',
  cursor: 'pointer',
  userSelect: 'none',
  borderBottom: collapsed ? 'none' : '1px solid var(--bo-border)',
  fontSize: 'var(--bo-text-xs)',
  fontWeight: 600,
  color: 'var(--bo-text-secondary)',
  transition: 'background var(--bo-transition-fast)',
});

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 'var(--bo-space-2)',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const stepStyle = (status: string): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-2)',
  padding: 'var(--bo-space-1) var(--bo-space-2)',
  borderRadius: 'var(--bo-radius-sm)',
  fontSize: 'var(--bo-text-xs)',
  color: status === 'error' ? 'var(--bo-error)' : status === 'done' ? 'var(--bo-success)' : status === 'running' ? 'var(--bo-accent)' : 'var(--bo-text-tertiary)',
  fontWeight: status === 'running' ? 600 : 400,
  transition: 'all var(--bo-transition-fast)',
});

const stepIconMap: Record<string, React.ReactNode> = {
  pending: <div style={{ width: 14, height: 14 }} />,
  running: <Loader2 size={14} style={{ animation: 'bo-spin 1s linear infinite' }} />,
  done: <CheckCircle2 size={14} />,
  error: <XCircle size={14} />,
};

interface ThinkingStreamProps {
  steps: ThinkingStep[];
}

export function ThinkingStream({ steps }: ThinkingStreamProps) {
  const [collapsed, setCollapsed] = useState(false);
  const running = steps.some(s => s.status === 'running');

  return (
    <div style={containerStyle}>
      <div
        style={headerStyle(collapsed)}
        onClick={() => setCollapsed(!collapsed)}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bo-bg-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <Brain size={14} />
        <span>
          {running ? 'Thinking...' : 'Done thinking'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)' }}>
          {steps.filter(s => s.status === 'done').length}/{steps.length} steps
        </span>
      </div>
      {!collapsed && (
        <div style={listStyle}>
          {steps.map(step => (
            <div key={step.id} style={stepStyle(step.status)}>
              {stepIconMap[step.status] || stepIconMap.pending}
              <span>{step.label}</span>
              {step.detail && (
                <span style={{ marginLeft: 'auto', fontSize: 'var(--bo-text-xs)', opacity: 0.6 }}>{step.detail}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
