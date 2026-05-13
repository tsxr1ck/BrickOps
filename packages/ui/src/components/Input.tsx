import { type CSSProperties, type InputHTMLAttributes, type ReactNode, forwardRef, useState } from 'react';

const containerStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  width: '100%',
};

const inputBaseStyle: CSSProperties = {
  width: '100%',
  height: '40px',
  background: 'var(--bo-bg-secondary)',
  border: '1px solid var(--bo-border)',
  borderRadius: 'var(--bo-radius-md)',
  padding: '0 var(--bo-space-3)',
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-text-primary)',
  transition: 'all var(--bo-transition-fast)',
  outline: 'none',
};

const iconStyle: CSSProperties = {
  position: 'absolute',
  left: 'var(--bo-space-3)',
  color: 'var(--bo-text-tertiary)',
  display: 'flex',
  alignItems: 'center',
  pointerEvents: 'none',
};

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ icon, style, ...props }, ref) => {
  const [focused, setFocused] = useState(false);

  return (
    <div style={containerStyle}>
      {icon && <div style={iconStyle}>{icon}</div>}
      <input
        ref={ref}
        style={{
          ...inputBaseStyle,
          paddingLeft: icon ? 'calc(var(--bo-space-3) * 2 + 16px)' : 'var(--bo-space-3)',
          borderColor: focused ? 'var(--bo-border-focus)' : 'var(--bo-border)',
          boxShadow: focused ? '0 0 0 2px var(--bo-accent-bg)' : 'none',
          ...style,
        }}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        {...props}
      />
    </div>
  );
});

Input.displayName = 'Input';
