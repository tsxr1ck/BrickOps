import type { CSSProperties } from 'react';

type BadgeStatus =
  | 'default' | 'draft' | 'planning' | 'coding'
  | 'building' | 'deployed' | 'failed'
  | 'low' | 'medium' | 'high' | 'critical';

const badges: Record<BadgeStatus, CSSProperties> = {
  default: { background: 'var(--bo-bg-elevated)', color: 'var(--bo-text-secondary)' },
  draft: { background: 'var(--bo-bg-elevated)', color: 'var(--bo-text-secondary)' },
  planning: { background: 'var(--bo-info-bg)', color: 'var(--bo-info)' },
  coding: { background: 'var(--bo-accent-bg)', color: 'var(--bo-accent)' },
  building: { background: 'var(--bo-info-bg)', color: 'var(--bo-info)' },
  deployed: { background: 'var(--bo-success-bg)', color: 'var(--bo-success)' },
  failed: { background: 'var(--bo-error-bg)', color: 'var(--bo-error)' },
  low: { background: 'var(--bo-success-bg)', color: 'var(--bo-success)' },
  medium: { background: 'var(--bo-warning-bg)', color: 'var(--bo-warning)' },
  high: { background: 'var(--bo-error-bg)', color: 'var(--bo-error)' },
  critical: { background: 'var(--bo-error)', color: 'var(--bo-text-inverse)' },
};

const baseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 'var(--bo-radius-sm)',
  fontSize: 'var(--bo-text-xs)',
  fontWeight: 'var(--bo-weight-semibold)',
  letterSpacing: '0.3px',
  whiteSpace: 'nowrap',
  textTransform: 'uppercase',
};

interface BadgeProps {
  status: BadgeStatus | string;
}

export function Badge({ status }: BadgeProps) {
  const s = (status || 'default') as BadgeStatus;
  const styles = badges[s] || badges.default;

  return (
    <span style={{ ...baseStyle, ...styles }}>
      {s.replace(/_/g, ' ')}
    </span>
  );
}
