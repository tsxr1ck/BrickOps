import { type CSSProperties, type ReactNode, useState } from 'react';

type CardVariant = 'raised' | 'outlined' | 'approval';

const variantBase: Record<CardVariant, CSSProperties> = {
  raised: {
    background: 'var(--bo-bg-raised)',
    boxShadow: 'var(--bo-shadow-sm)',
  },
  outlined: {
    background: 'var(--bo-bg-surface)',
    border: '1px solid var(--bo-border)',
    boxShadow: 'var(--bo-shadow-sm)',
  },
  approval: {
    background: 'var(--bo-bg-surface)',
    borderLeft: '3px solid var(--bo-warning)',
    boxShadow: 'var(--bo-shadow-sm)',
  },
};

const baseStyle: CSSProperties = {
  borderRadius: 'var(--bo-radius-md)',
  padding: 'var(--bo-space-4) var(--bo-space-5)',
  transition: 'all var(--bo-transition-normal)',
};

interface CardProps {
  variant?: CardVariant;
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
  id?: string;
}

export function Card({ variant = 'outlined', children, onClick, style, id }: CardProps) {
  const [hover, setHover] = useState(false);
  const isInteractive = !!onClick;

  return (
    <div
      id={id}
      style={{
        ...baseStyle,
        ...variantBase[variant],
        cursor: isInteractive ? 'pointer' : undefined,
        ...(isInteractive && hover
          ? { boxShadow: 'var(--bo-shadow-md)', transform: 'translateY(-1px)' }
          : {}),
        ...style,
      }}
      onClick={onClick}
      onMouseEnter={() => isInteractive && setHover(true)}
      onMouseLeave={() => isInteractive && setHover(false)}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      {children}
    </div>
  );
}
