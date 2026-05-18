import type { CSSProperties } from 'react';

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 8px',
  borderRadius: 'var(--bo-radius-sm)',
  fontSize: 'var(--bo-text-xs)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

interface ComplianceBadgeProps {
  label: string;
  variant?: 'standard' | 'wcag' | 'enterprise';
  style?: CSSProperties;
}

export function ComplianceBadge({ label, variant = 'standard', style }: ComplianceBadgeProps) {
  const colors: Record<string, CSSProperties> = {
    standard: { background: 'var(--bo-bg-elevated)', color: 'var(--bo-text-secondary)' },
    wcag: { background: 'var(--bo-info-bg)', color: 'var(--bo-info)' },
    enterprise: { background: 'var(--bo-accent-bg)', color: 'var(--bo-accent)' },
  };

  return (
    <span style={{ ...badgeStyle, ...colors[variant], ...style }}>
      {label}
    </span>
  );
}
