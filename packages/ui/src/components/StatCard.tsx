import { type CSSProperties, type ReactNode, useState } from 'react';

const cardStyle: CSSProperties = {
  background: 'var(--bo-bg-elevated)',
  borderRadius: 'var(--bo-radius-md)',
  padding: 'var(--bo-space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-2)',
  position: 'relative',
  overflow: 'hidden',
  border: '1px solid var(--bo-border)',
  transition: 'transform var(--bo-transition-fast), box-shadow var(--bo-transition-fast)',
  flex: '1 1 0',
  minWidth: '120px',
  cursor: 'default',
};

const topRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  color: 'var(--bo-text-secondary)',
};

const labelStyle: CSSProperties = {
  fontSize: 'var(--bo-text-xs)',
  fontWeight: 'var(--bo-weight-medium)' as any,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const valueStyle: CSSProperties = {
  fontSize: 'var(--bo-text-2xl)',
  fontWeight: 'var(--bo-weight-bold)' as any,
  color: 'var(--bo-text-primary)',
  lineHeight: '1',
};

const iconContainerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--bo-text-tertiary)',
};

// A subtle gradient blob in the background
const gradientBlobStyle = (color: string): CSSProperties => ({
  position: 'absolute',
  top: '-50%',
  right: '-20%',
  width: '100px',
  height: '100px',
  borderRadius: '50%',
  background: color,
  filter: 'blur(40px)',
  opacity: 0.15,
  zIndex: 0,
  pointerEvents: 'none',
  transition: 'opacity var(--bo-transition-normal)',
});

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  accentColor?: string; // e.g., 'var(--bo-accent)'
}

export function StatCard({ label, value, icon, accentColor = 'var(--bo-accent)' }: StatCardProps) {
  const [hover, setHover] = useState(false);

  return (
    <div 
      style={{
        ...cardStyle,
        ...(hover ? { transform: 'translateY(-2px)', boxShadow: 'var(--bo-shadow-md)' } : {})
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={gradientBlobStyle(accentColor)} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-2)' }}>
        <div style={topRowStyle}>
          <span style={labelStyle}>{label}</span>
          {icon && <div style={iconContainerStyle}>{icon}</div>}
        </div>
        <div style={valueStyle}>{value}</div>
      </div>
    </div>
  );
}
