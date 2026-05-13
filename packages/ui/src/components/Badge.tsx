import type { CSSProperties, ReactNode } from 'react';

type BadgeVariant =
  | 'default'
  | 'draft'
  | 'planning'
  | 'coding'
  | 'reviewing'
  | 'building'
  | 'deployed'
  | 'failed'
  | 'waiting'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

const variantStyles: Record<BadgeVariant, CSSProperties> = {
  default: { background: 'var(--bo-bg-tertiary)', color: 'var(--bo-text-secondary)' },
  draft: { background: 'var(--bo-bg-tertiary)', color: 'var(--bo-text-secondary)' },
  planning: { background: 'var(--bo-info-bg)', color: 'var(--bo-info)' },
  coding: { background: 'var(--bo-accent-bg)', color: 'var(--bo-accent)' },
  reviewing: { background: 'var(--bo-warning-bg)', color: 'var(--bo-warning)' },
  building: { background: 'var(--bo-info-bg)', color: 'var(--bo-info)' },
  deployed: { background: 'var(--bo-success-bg)', color: 'var(--bo-success)' },
  failed: { background: 'var(--bo-error-bg)', color: 'var(--bo-error)' },
  waiting: { background: 'var(--bo-warning-bg)', color: 'var(--bo-warning)' },
  low: { background: 'var(--bo-success-bg)', color: 'var(--bo-success)' },
  medium: { background: 'var(--bo-warning-bg)', color: 'var(--bo-warning)' },
  high: { background: 'var(--bo-error-bg)', color: 'var(--bo-error)' },
  critical: { background: 'var(--bo-error-bg)', color: 'var(--bo-error)' },
};

/** Maps project status strings to badge variants. */
function resolveVariant(status: string): BadgeVariant {
  const s = status.toLowerCase().replace(/[_\s]/g, '');
  if (s.includes('draft')) return 'draft';
  if (s.includes('planning') || s.includes('clarif')) return 'planning';
  if (s.includes('coding') || s.includes('provisioning') || s.includes('indexing')) return 'coding';
  if (s.includes('review') || s.includes('realitycheck')) return 'reviewing';
  if (s.includes('build') || s.includes('install') || s.includes('test')) return 'building';
  if (s.includes('deploy') || s.includes('preview') || s.includes('ready')) return 'deployed';
  if (s.includes('fail')) return 'failed';
  if (s.includes('await') || s.includes('waiting') || s.includes('pending')) return 'waiting';
  if (s === 'low') return 'low';
  if (s === 'medium') return 'medium';
  if (s === 'high') return 'high';
  if (s === 'critical') return 'critical';
  return 'default';
}

const baseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 10px',
  borderRadius: 'var(--bo-radius-full)',
  fontSize: 'var(--bo-text-xs)',
  fontWeight: 'var(--bo-weight-semibold)' as any,
  letterSpacing: '0.3px',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  lineHeight: '1.6',
};

interface BadgeProps {
  status: string;
  children?: ReactNode;
  variant?: BadgeVariant;
}

export function Badge({ status, children, variant }: BadgeProps) {
  const v = variant ?? resolveVariant(status);
  return (
    <span style={{ ...baseStyle, ...variantStyles[v] }}>
      {children ?? status.replace(/_/g, ' ')}
    </span>
  );
}
