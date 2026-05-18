import type { CSSProperties } from 'react';

const tabRow: CSSProperties = {
  display: 'flex',
  gap: '2px',
  borderBottom: '1px solid var(--bo-border)',
};

interface FilterTabsProps {
  options: Array<{ id: string; label: string }>;
  activeId: string;
  onChange: (id: string) => void;
}

export function FilterTabs({ options, activeId, onChange }: FilterTabsProps) {
  return (
    <div style={tabRow}>
      {options.map((opt) => {
        const isActive = opt.id === activeId;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            style={{
              padding: 'var(--bo-space-2) var(--bo-space-4)',
              fontSize: 'var(--bo-text-sm)',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--bo-accent)' : 'var(--bo-text-secondary)',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${isActive ? 'var(--bo-accent)' : 'transparent'}`,
              cursor: 'pointer',
              transition: 'all var(--bo-transition-fast)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
