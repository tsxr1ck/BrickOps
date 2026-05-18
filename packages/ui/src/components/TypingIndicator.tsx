import type { CSSProperties } from 'react';

const wrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-2)',
  padding: 'var(--bo-space-2) var(--bo-space-4)',
  alignSelf: 'flex-start',
};

const dotStyle: CSSProperties = {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: 'var(--bo-accent)',
  animation: 'bo-bounce 1.2s infinite',
};

interface TypingIndicatorProps {
  label?: string;
}

export function TypingIndicator({ label = 'Thinking' }: TypingIndicatorProps) {
  return (
    <div style={wrapStyle}>
      <span style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
        <span style={{ ...dotStyle, animationDelay: '0s' }} />
        <span style={{ ...dotStyle, animationDelay: '0.2s' }} />
        <span style={{ ...dotStyle, animationDelay: '0.4s' }} />
      </div>
      <style>{`
        @keyframes bo-bounce {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
