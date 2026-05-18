import type { CSSProperties, ReactNode } from 'react';

export type ChatRole = 'user' | 'assistant' | 'system' | 'agent';

const bubbleBase: CSSProperties = {
  maxWidth: '80%',
  padding: 'var(--bo-space-3) var(--bo-space-4)',
  borderRadius: 'var(--bo-radius-md)',
  fontSize: 'var(--bo-text-sm)',
  lineHeight: '1.55',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const roleStyles: Record<ChatRole, CSSProperties> = {
  user: {
    ...bubbleBase,
    alignSelf: 'flex-end',
    background: 'var(--bo-accent-bg)',
    color: 'var(--bo-accent)',
    borderBottomRightRadius: 'var(--bo-radius-sm)',
    border: '1px solid var(--bo-accent-border)',
  },
  assistant: {
    ...bubbleBase,
    alignSelf: 'flex-start',
    background: 'var(--bo-bg-elevated)',
    color: 'var(--bo-text)',
    borderBottomLeftRadius: 'var(--bo-radius-sm)',
    fontFamily: 'var(--bo-font-sans)',
  },
  system: {
    ...bubbleBase,
    alignSelf: 'center',
    background: 'transparent',
    color: 'var(--bo-text-tertiary)',
    fontSize: 'var(--bo-text-xs)',
    maxWidth: '100%',
    textAlign: 'center',
    fontFamily: 'var(--bo-font-mono)',
  },
  agent: {
    ...bubbleBase,
    alignSelf: 'flex-start',
    background: 'var(--bo-bg)',
    color: 'var(--bo-text-secondary)',
    borderBottomLeftRadius: 'var(--bo-radius-sm)',
    border: '1px solid var(--bo-border)',
    fontFamily: 'var(--bo-font-mono)',
    fontSize: 'var(--bo-text-xs)',
  },
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-1)',
};

interface ChatBubbleProps {
  role: ChatRole;
  children: ReactNode;
  timestamp?: string;
  avatar?: ReactNode;
}

export function ChatBubble({ role, children, timestamp, avatar }: ChatBubbleProps) {
  const isUser = role === 'user';

  return (
    <div
      style={{
        ...rowStyle,
        alignItems: isUser ? 'flex-end' : 'flex-start',
        paddingLeft: isUser ? 'var(--bo-space-8)' : 0,
        paddingRight: isUser ? 0 : 'var(--bo-space-8)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--bo-space-2)' }}>
        {!isUser && avatar && (
          <span style={{ display: 'flex', flexShrink: 0, color: 'var(--bo-accent)' }}>
            {avatar}
          </span>
        )}
        <div style={roleStyles[role]}>{children}</div>
      </div>
      {timestamp && (
        <span
          style={{
            fontSize: 'var(--bo-text-xs)',
            color: 'var(--bo-text-tertiary)',
            padding: '0 var(--bo-space-1)',
          }}
        >
          {timestamp}
        </span>
      )}
    </div>
  );
}
