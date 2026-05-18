import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, CSSProperties> = {
  filled: {
    background: 'var(--bo-accent)',
    color: 'var(--bo-text-inverse)',
  },
  tonal: {
    background: 'var(--bo-accent-bg)',
    color: 'var(--bo-accent)',
  },
  outlined: {
    background: 'transparent',
    color: 'var(--bo-accent)',
    border: '1px solid var(--bo-accent)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--bo-text-secondary)',
  },
};

const sizes: Record<ButtonSize, CSSProperties> = {
  sm: { padding: '5px 14px', fontSize: 'var(--bo-text-sm)', minHeight: '32px', borderRadius: 'var(--bo-radius-sm)' },
  md: { padding: '8px 20px', fontSize: 'var(--bo-text-sm)', minHeight: 'var(--bo-tap-target)', borderRadius: 'var(--bo-radius-md)' },
  lg: { padding: '12px 28px', fontSize: 'var(--bo-text-base)', minHeight: '48px', borderRadius: 'var(--bo-radius-md)' },
};

const baseStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  fontWeight: 'var(--bo-weight-medium)',
  transition: 'all var(--bo-transition-fast)', cursor: 'pointer',
  whiteSpace: 'nowrap', userSelect: 'none', WebkitTapHighlightColor: 'transparent',
};

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  fullWidth?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Button({
  variant = 'filled', size = 'md', icon, fullWidth, children, style, disabled, ...rest
}: ButtonProps) {
  return (
    <button
      style={{
        ...baseStyle, ...variants[variant], ...sizes[size],
        ...(fullWidth ? { width: '100%' } : {}),
        ...(disabled ? { opacity: 0.35, pointerEvents: 'none' } : {}),
        ...style,
      }}
      disabled={disabled}
      {...rest}
    >
      {icon && <span style={{ display: 'flex' }}>{icon}</span>}
      {children}
    </button>
  );
}
