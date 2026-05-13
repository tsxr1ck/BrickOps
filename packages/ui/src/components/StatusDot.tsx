import type { CSSProperties } from 'react';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

const colors: Record<ConnectionStatus, string> = {
  connected: 'var(--bo-success)',
  connecting: 'var(--bo-warning)',
  disconnected: 'var(--bo-text-tertiary)',
};

const labels: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  disconnected: 'Disconnected',
};

const containerStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-text-secondary)',
};

interface StatusDotProps {
  status: ConnectionStatus;
  label?: string;
}

export function StatusDot({ status, label }: StatusDotProps) {
  const color = colors[status];

  return (
    <span style={containerStyle}>
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
          boxShadow: status === 'connected' ? `0 0 0 3px ${color}33` : 'none',
          animation: status === 'connecting' ? 'bo-pulse 1.5s ease infinite' : 'none',
        }}
      />
      {label ?? labels[status]}
      <style>{`
        @keyframes bo-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </span>
  );
}
