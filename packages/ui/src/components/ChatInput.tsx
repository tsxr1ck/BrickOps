import { type CSSProperties, useRef } from 'react';
import { Send } from 'lucide-react';

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--bo-space-2)',
  padding: 'var(--bo-space-3) var(--bo-space-4)',
  borderTop: '1px solid var(--bo-border)',
  background: 'var(--bo-bg)',
};

const inputStyle: CSSProperties = {
  flex: 1,
  padding: 'var(--bo-space-3) var(--bo-space-4)',
  borderRadius: 'var(--bo-radius-sm)',
  border: '1px solid var(--bo-border)',
  background: 'var(--bo-bg-input)',
  color: 'var(--bo-text)',
  fontSize: 'var(--bo-text-sm)',
  outline: 'none',
  fontFamily: 'var(--bo-font-sans)',
};

const sendBtn = (disabled: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '40px',
  height: '40px',
  borderRadius: 'var(--bo-radius-sm)',
  background: 'var(--bo-accent)',
  color: 'var(--bo-text-inverse)',
  border: 'none',
  cursor: disabled ? 'default' : 'pointer',
  flexShrink: 0,
  opacity: disabled ? 0.4 : 1,
  transition: 'opacity var(--bo-transition-fast)',
});

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ value, onChange, onSend, disabled, placeholder = 'Describe what you want to change...' }: ChatInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !disabled && value.trim()) {
      onSend();
    }
  };

  const isEmpty = !value.trim();

  return (
    <div style={rowStyle}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={inputStyle}
      />
      <button
        onClick={onSend}
        disabled={disabled || isEmpty}
        style={sendBtn(disabled || isEmpty)}
        aria-label="Send"
      >
        <Send size={16} />
      </button>
    </div>
  );
}
