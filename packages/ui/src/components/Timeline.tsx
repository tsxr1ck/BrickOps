import type { CSSProperties, ReactNode } from 'react';

export interface TimelineEntry {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  icon?: ReactNode;
  status?: 'completed' | 'active' | 'pending' | 'failed';
}

const statusColors: Record<string, string> = {
  completed: 'var(--bo-success)',
  active: 'var(--bo-accent)',
  pending: 'var(--bo-text-tertiary)',
  failed: 'var(--bo-error)',
};

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const entryStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--bo-space-3)',
  paddingBottom: 'var(--bo-space-5)',
  position: 'relative',
};

const dotColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '24px',
  flexShrink: 0,
};

const lineStyle: CSSProperties = {
  width: '1px',
  flex: 1,
  background: 'var(--bo-border)',
  marginTop: '4px',
};

const contentStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

interface TimelineProps {
  entries: TimelineEntry[];
}

export function Timeline({ entries }: TimelineProps) {
  return (
    <div style={containerStyle}>
      {entries.map((entry, i) => {
        const color = statusColors[entry.status || 'pending'];
        const isLast = i === entries.length - 1;

        return (
          <div key={entry.id} style={entryStyle}>
            <div style={dotColumnStyle}>
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: color,
                  flexShrink: 0,
                  marginTop: '5px',
                  transition: 'all var(--bo-transition-normal)',
                }}
              />
              {!isLast && <div style={lineStyle} />}
            </div>
            <div style={contentStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--bo-space-2)' }}>
                <span
                  style={{
                    fontSize: 'var(--bo-text-sm)',
                    fontWeight: entry.status === 'active' ? 600 : 500,
                    color: entry.status === 'active' ? 'var(--bo-text)' : 'var(--bo-text-secondary)',
                  }}
                >
                  {entry.icon} {entry.title}
                </span>
                <span style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)', whiteSpace: 'nowrap' }}>
                  {entry.timestamp}
                </span>
              </div>
              {entry.description && (
                <p style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-secondary)', marginTop: '2px' }}>
                  {entry.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
