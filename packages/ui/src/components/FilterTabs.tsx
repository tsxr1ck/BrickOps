import { type CSSProperties } from 'react';

const containerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  background: 'var(--bo-bg-secondary)',
  borderRadius: 'var(--bo-radius-md)',
  padding: '4px',
  gap: '2px',
  overflowX: 'auto',
  scrollbarWidth: 'none', // Firefox
  msOverflowStyle: 'none',  // IE and Edge
};

const tabBaseStyle: CSSProperties = {
  padding: '6px var(--bo-space-3)',
  borderRadius: 'var(--bo-radius-sm)',
  fontSize: 'var(--bo-text-sm)',
  fontWeight: 'var(--bo-weight-medium)' as any,
  cursor: 'pointer',
  transition: 'all var(--bo-transition-fast)',
  border: 'none',
  outline: 'none',
  whiteSpace: 'nowrap',
};

export interface TabOption {
  id: string;
  label: string;
}

export interface FilterTabsProps {
  options: TabOption[];
  activeId: string;
  onChange: (id: string) => void;
  style?: CSSProperties;
}

export function FilterTabs({ options, activeId, onChange, style }: FilterTabsProps) {
  return (
    <div 
      style={{ ...containerStyle, ...style }}
      // Hide scrollbar for WebKit
      ref={(el) => {
        if (el) {
          el.style.setProperty('::-webkit-scrollbar', 'display: none');
        }
      }}
    >
      {options.map((option) => {
        const isActive = option.id === activeId;
        return (
          <button
            key={option.id}
            style={{
              ...tabBaseStyle,
              background: isActive ? 'var(--bo-bg-elevated)' : 'transparent',
              color: isActive ? 'var(--bo-text-primary)' : 'var(--bo-text-secondary)',
              boxShadow: isActive ? 'var(--bo-shadow-sm)' : 'none',
            }}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
