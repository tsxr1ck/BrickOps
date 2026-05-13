import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--bo-accent)', color: '#fff' },
  secondary: { background: 'var(--bo-bg-tertiary)', color: 'var(--bo-text-primary)', border: '1px solid var(--bo-border)' },
  danger: { background: 'var(--bo-error-bg)', color: 'var(--bo-error)', border: '1px solid var(--bo-error)' },
  ghost: { background: 'transparent', color: 'var(--bo-text-secondary)' },
};

const sizes: Record<ButtonSize, CSSProperties> = {
  sm: { padding: '6px 14px', fontSize: 'var(--bo-text-sm)', minHeight: '36px' },
  md: { padding: '10px 20px', fontSize: 'var(--bo-text-base)', minHeight: 'var(--bo-tap-target)' },
  lg: { padding: '14px 28px', fontSize: 'var(--bo-text-lg)', minHeight: '56px' },
};

const baseStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  borderRadius: 'var(--bo-radius-md)', fontWeight: 'var(--bo-weight-semibold)' as any,
  transition: 'all var(--bo-transition-fast)', cursor: 'pointer', border: '1px solid transparent',
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

export function Button({ variant = 'primary', size = 'md', icon, fullWidth, children, style, disabled, ...rest }: ButtonProps) {
  return (
    <button
      style={{
        ...baseStyle, ...variants[variant], ...sizes[size],
        ...(fullWidth ? { width: '100%' } : {}),
        ...(disabled ? { opacity: 0.5, pointerEvents: 'none' } : {}),
        ...style,
      }}
      disabled={disabled}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
