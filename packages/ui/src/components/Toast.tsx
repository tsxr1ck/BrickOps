import { type CSSProperties, useEffect, useState } from 'react';

type ToastSeverity = 'info' | 'success' | 'warning' | 'error';

const severityStyles: Record<ToastSeverity, CSSProperties> = {
  info: { background: 'var(--bo-bg-elevated)', borderLeft: '3px solid var(--bo-info)' },
  success: { background: 'var(--bo-bg-elevated)', borderLeft: '3px solid var(--bo-success)' },
  warning: { background: 'var(--bo-bg-elevated)', borderLeft: '3px solid var(--bo-warning)' },
  error: { background: 'var(--bo-bg-elevated)', borderLeft: '3px solid var(--bo-error)' },
};

const toastStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-3)',
  padding: 'var(--bo-space-3) var(--bo-space-4)',
  borderRadius: 'var(--bo-radius-sm)',
  boxShadow: 'var(--bo-shadow-lg)',
  fontSize: 'var(--bo-text-sm)',
  minWidth: '280px',
  maxWidth: '400px',
  pointerEvents: 'auto',
  transition: 'all var(--bo-transition-normal)',
};

interface ToastProps {
  message: string;
  severity?: ToastSeverity;
  onClose?: () => void;
  duration?: number;
}

export function Toast({ message, severity = 'info', onClose, duration = 4000 }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onClose?.(), 200);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  return (
    <div
      style={{
        ...toastStyle,
        ...severityStyles[severity],
      }}
      role="alert"
    >
      <span style={{ flex: 1, color: 'var(--bo-text)' }}>{message}</span>
      <button
        onClick={() => { setVisible(false); onClose?.(); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--bo-text-tertiary)', fontSize: '16px',
          padding: '2px', lineHeight: 1,
        }}
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  );
}
