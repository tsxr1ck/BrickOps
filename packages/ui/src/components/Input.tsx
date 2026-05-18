import { type CSSProperties, type ReactNode, useState, useRef } from 'react';

const wrapperStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  borderRadius: 'var(--bo-radius-sm)',
  transition: 'all var(--bo-transition-fast)',
};

const inputStyle: CSSProperties = {
  flex: 1,
  background: 'none',
  border: 'none',
  outline: 'none',
  color: 'var(--bo-text)',
  fontSize: 'var(--bo-text-sm)',
  caretColor: 'var(--bo-accent)',
  minHeight: '20px',
};

const iconStyle: CSSProperties = {
  display: 'flex',
  color: 'var(--bo-text-tertiary)',
};

interface InputProps {
  icon?: ReactNode;
  value?: string;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  name?: string;
  id?: string;
  autoFocus?: boolean;
  style?: CSSProperties;
  className?: string;
}

export function Input({ icon, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{
        ...wrapperStyle,
        background: focused ? 'var(--bo-bg-input)' : 'var(--bo-bg-surface)',
        border: focused
          ? '1px solid var(--bo-accent)'
          : '1px solid var(--bo-border)',
        boxShadow: focused ? 'var(--bo-shadow-brand)' : 'none',
        ...(rest as any).style,
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {icon && <span style={iconStyle}>{icon}</span>}
      <input
        ref={inputRef}
        style={inputStyle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
    </div>
  );
}
