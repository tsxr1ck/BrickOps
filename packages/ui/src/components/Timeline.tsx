import { type CSSProperties, type ReactNode, useState } from 'react';
import { Wrench, FileText, FlaskConical, Brain, AlertCircle, CheckCircle2, Play } from 'lucide-react';

export interface TimelineEntry {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  icon?: ReactNode;
  status?: 'completed' | 'active' | 'pending' | 'failed';
  kind: string;
  runId?: string;
}

interface TimelineProps {
  entries: TimelineEntry[];
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
  paddingBottom: 'var(--bo-space-4)',
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

const kindIcons: Record<string, ReactNode> = {
  llm_thinking_delta: <Brain size={12} />,
  llm_content_delta: <Brain size={12} />,
  tool_started: <Wrench size={12} />,
  tool_finished: <Wrench size={12} />,
  file_read: <FileText size={12} />,
  file_written: <FileText size={12} />,
  diff_applied: <FileText size={12} />,
  tests_started: <FlaskConical size={12} />,
  tests_finished: <FlaskConical size={12} />,
  'session.run_started': <Play size={12} />,
  'session.run_completed': <CheckCircle2 size={12} />,
  'session.error': <AlertCircle size={12} />,
};

function getKindCategory(kind: string): string {
  if (kind.startsWith('llm_')) return 'llm';
  if (kind.startsWith('tool_')) return 'tools';
  if (kind.startsWith('file_') || kind === 'diff_applied') return 'files';
  if (kind.startsWith('test')) return 'tests';
  return 'other';
}

const filterDefs = [
  { key: 'llm', label: 'LLM', color: 'var(--bo-info)' },
  { key: 'tools', label: 'Tools', color: 'var(--bo-accent)' },
  { key: 'files', label: 'Files', color: 'var(--bo-success)' },
  { key: 'tests', label: 'Tests', color: 'var(--bo-warning)' },
];

const filterBarStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--bo-space-2)',
  paddingBottom: 'var(--bo-space-3)',
  borderBottom: '1px solid var(--bo-border)',
  marginBottom: 'var(--bo-space-3)',
  flexWrap: 'wrap',
};

const filterChipStyle = (active: boolean, color: string): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-1)',
  padding: 'var(--bo-space-1) var(--bo-space-2)',
  borderRadius: 'var(--bo-radius-full)',
  fontSize: 'var(--bo-text-xs)',
  fontWeight: active ? 600 : 400,
  background: active ? `${color}20` : 'transparent',
  color: active ? color : 'var(--bo-text-tertiary)',
  border: `1px solid ${active ? color : 'var(--bo-border)'}`,
  cursor: 'pointer',
  transition: 'all var(--bo-transition-fast)',
});

const runHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-2)',
  padding: 'var(--bo-space-1) var(--bo-space-2)',
  borderRadius: 'var(--bo-radius-sm)',
  background: 'var(--bo-bg-raised)',
  fontSize: 'var(--bo-text-xs)',
  color: 'var(--bo-text-tertiary)',
  marginBottom: 'var(--bo-space-2)',
  fontWeight: 600,
};

export function Timeline({ entries }: TimelineProps) {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(['llm', 'tools', 'files', 'tests', 'other'])
  );

  const toggleFilter = (key: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filtered = entries.filter(e => {
    const cat = getKindCategory(e.kind);
    return activeFilters.has(cat);
  });

  // Group by runId
  const groups: { runId: string; entries: TimelineEntry[] }[] = [];
  let currentGroup: { runId: string; entries: TimelineEntry[] } | null = null;
  for (const entry of filtered) {
    const rid = entry.runId || '';
    if (!currentGroup || currentGroup.runId !== rid) {
      currentGroup = { runId: rid, entries: [] };
      groups.push(currentGroup);
    }
    currentGroup.entries.push(entry);
  }

  return (
    <div style={containerStyle}>
      <div style={filterBarStyle}>
        {filterDefs.map(f => (
          <button
            key={f.key}
            style={filterChipStyle(activeFilters.has(f.key), f.color)}
            onClick={() => toggleFilter(f.key)}
          >
            {activeFilters.has(f.key) && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: f.color }} />}
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <div style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)', textAlign: 'center', paddingTop: 'var(--bo-space-4)' }}>
          No events match the current filters.
        </div>
      )}

      {groups.map((group, gi) => (
        <div key={group.runId}>
          {group.runId && gi > 0 && (
            <div style={runHeaderStyle}>
              <Play size={10} />
              Run {group.runId.slice(0, 8)}
            </div>
          )}
          {group.entries.map((entry, i) => {
            const color = statusColors[entry.status || 'pending'];
            const isLast = i === group.entries.length - 1;
            const icon = entry.icon || kindIcons[entry.kind];

            return (
              <div key={entry.id} style={entryStyle}>
                <div style={dotColumnStyle}>
                  <div
                    style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: color, flexShrink: 0, marginTop: '5px',
                      transition: 'all var(--bo-transition-normal)',
                    }}
                  />
                  {!isLast && <div style={lineStyle} />}
                </div>
                <div style={contentStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--bo-space-2)' }}>
                    <span
                      style={{
                        fontSize: 'var(--bo-text-sm)', fontWeight: entry.status === 'active' ? 600 : 500,
                        color: entry.status === 'active' ? 'var(--bo-text)' : 'var(--bo-text-secondary)',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      {icon && <span style={{ flexShrink: 0, opacity: 0.7 }}>{icon}</span>}
                      {entry.title}
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
      ))}
    </div>
  );
}
