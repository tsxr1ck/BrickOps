import { type CSSProperties, type ReactNode, useState } from 'react';

type CardVariant = 'default' | 'interactive' | 'approval';

const variantBase: Record<CardVariant, CSSProperties> = {
  default: {
    background: 'var(--bo-bg-elevated)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--bo-border)',
  },
  interactive: {
    background: 'var(--bo-bg-elevated)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--bo-border)',
    cursor: 'pointer',
  },
  approval: {
    background: 'var(--bo-bg-elevated)',
    borderWidth: '1px 1px 1px 4px',
    borderStyle: 'solid',
    borderColor: 'var(--bo-warning)',
  },
};

const baseStyle: CSSProperties = {
  borderRadius: 'var(--bo-radius-lg)',
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

export function Card({ variant = 'default', children, onClick, style, id }: CardProps) {
  const [hover, setHover] = useState(false);
  const isInteractive = variant === 'interactive' || !!onClick;

  return (
    <div
      id={id}
      style={{
        ...baseStyle,
        ...variantBase[variant],
        ...(isInteractive && hover
          ? { boxShadow: 'var(--bo-shadow-md)', borderColor: 'var(--bo-accent-border)', transform: 'translateY(-1px)' }
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
