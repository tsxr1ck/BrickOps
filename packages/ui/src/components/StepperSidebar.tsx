import type { CSSProperties } from 'react';

export interface StepperStep {
  id: string;
  label: string;
  status: 'completed' | 'active' | 'pending';
}

const sidebarStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  padding: 'var(--bo-space-3)',
};

const stepStyle = (status: StepperStep['status']): CSSProperties => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--bo-space-3)',
  padding: 'var(--bo-space-3) var(--bo-space-2)',
  opacity: status === 'pending' ? 0.4 : 1,
  cursor: 'default',
});

const dotStyle = (status: StepperStep['status']): CSSProperties => {
  const base: CSSProperties = {
    width: '22px',
    height: '22px',
    borderRadius: 'var(--bo-radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: '11px',
    fontWeight: 600,
    transition: 'all var(--bo-transition-normal)',
  };
  if (status === 'completed') {
    return {
      ...base,
      background: 'var(--bo-accent-bg)',
      color: 'var(--bo-accent)',
    };
  }
  if (status === 'active') {
    return {
      ...base,
      background: 'var(--bo-accent)',
      color: 'var(--bo-text-inverse)',
      boxShadow: 'var(--bo-shadow-brand)',
    };
  }
  return {
    ...base,
    background: 'var(--bo-bg-elevated)',
    color: 'var(--bo-text-tertiary)',
  };
};

const connectorStyle: CSSProperties = {
  width: '1px',
  height: '16px',
  background: 'var(--bo-border)',
  marginLeft: '10.5px',
};

interface StepperSidebarProps {
  steps: StepperStep[];
}

export function StepperSidebar({ steps }: StepperSidebarProps) {
  return (
    <div style={sidebarStyle}>
      {steps.map((step, i) => (
        <div key={step.id}>
          <div style={stepStyle(step.status)}>
            <div style={dotStyle(step.status)}>
              {step.status === 'completed' ? '✓' : step.status === 'active' ? '◈' : i + 1}
            </div>
            <span
              style={{
                fontSize: 'var(--bo-text-sm)',
                fontWeight: step.status === 'active' ? 600 : 400,
                color: 'var(--bo-text)',
                paddingTop: '2px',
                fontFamily: step.status === 'active' ? 'var(--bo-font-sans)' : undefined,
              }}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && <div style={connectorStyle} />}
        </div>
      ))}
    </div>
  );
}
