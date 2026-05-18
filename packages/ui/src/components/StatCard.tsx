import { type CSSProperties, type ReactNode, useState } from 'react';

const cardStyle: CSSProperties = {
  background: 'var(--bo-bg-surface)',
  borderRadius: 'var(--bo-radius-md)',
  padding: 'var(--bo-space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-2)',
  border: '1px solid var(--bo-border)',
  transition: 'transform var(--bo-transition-fast), box-shadow var(--bo-transition-fast)',
  flex: '1 1 0',
  minWidth: '120px',
};

const topRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  color: 'var(--bo-text-secondary)',
};

const labelStyle: CSSProperties = {
  fontSize: 'var(--bo-text-xs)',
  fontWeight: 'var(--bo-weight-medium)',
  letterSpacing: '0.3px',
  textTransform: 'uppercase',
};

const valueStyle: CSSProperties = {
  fontSize: 'var(--bo-text-2xl)',
  fontWeight: 'var(--bo-weight-bold)',
  color: 'var(--bo-text)',
  lineHeight: '1',
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
}

export function StatCard({ label, value, icon }: StatCardProps) {
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        ...cardStyle,
        ...(hover ? { transform: 'translateY(-1px)', boxShadow: 'var(--bo-shadow-md)' } : {}),
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={topRowStyle}>
        <span style={labelStyle}>{label}</span>
        {icon && <span style={{ display: 'flex' }}>{icon}</span>}
      </div>
      <div style={valueStyle}>{value}</div>
    </div>
  );
}
