import type { CSSProperties } from 'react';

const dotColors: Record<string, CSSProperties> = {
  completed: { background: 'var(--bo-success)', boxShadow: '0 0 6px var(--bo-success)' },
  active: { background: 'var(--bo-accent)', boxShadow: '0 0 6px var(--bo-accent)' },
  pending: { background: 'var(--bo-text-tertiary)' },
  failed: { background: 'var(--bo-error)', boxShadow: '0 0 6px var(--bo-error)' },
  deployed: { background: 'var(--bo-success)', boxShadow: '0 0 6px var(--bo-success)' },
};

const dotStyle: CSSProperties = {
  width: '7px',
  height: '7px',
  borderRadius: '50%',
  display: 'inline-block',
  flexShrink: 0,
};

interface StatusDotProps {
  status: string;
}

export function StatusDot({ status }: StatusDotProps) {
  const color = dotColors[status] || dotColors.pending;
  return <span style={{ ...dotStyle, ...color }} />;
}
