import { type CSSProperties, type ReactNode, useRef, useEffect, useState, useCallback } from 'react';
import { ChatBubble } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'agent';
  content: string;
  timestamp?: number;
}

const LONG_MSG_THRESHOLD = 600;

const containerStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 'var(--bo-space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-3)',
};

const showMoreBtn: CSSProperties = {
  display: 'block',
  marginTop: 'var(--bo-space-1)',
  fontSize: 'var(--bo-text-xs)',
  color: 'var(--bo-accent)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  fontFamily: 'inherit',
};

interface ChatTimelineProps {
  messages: ChatMessage[];
  isRunning?: boolean;
  emptyState?: ReactNode;
  onMessageClick?: (id: string) => void;
}

export function ChatTimeline({ messages, isRunning, emptyState, onMessageClick }: ChatTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const prevLenRef = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevLenRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLenRef.current = messages.length;
  }, [messages.length]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div style={containerStyle}>
      {messages.length === 0 && emptyState ? (
        emptyState
      ) : (
        messages.map((m) => {
          const isLong = m.content.length > LONG_MSG_THRESHOLD;
          const isExpanded = expanded.has(m.id);
          const displayContent = isLong && !isExpanded
            ? m.content.slice(0, LONG_MSG_THRESHOLD)
            : m.content;

          return (
            <div
              key={m.id}
              onClick={() => onMessageClick?.(m.id)}
              style={{ cursor: onMessageClick ? 'pointer' : undefined }}
            >
              <ChatBubble
                role={m.role}
                timestamp={m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : undefined}
              >
                {displayContent}
                {isLong && (
                  <button
                    style={showMoreBtn}
                    onClick={(e) => { e.stopPropagation(); toggleExpand(m.id); }}
                  >
                    {isExpanded ? 'Show less' : `Show more (${m.content.length - LONG_MSG_THRESHOLD} more chars)`}
                  </button>
                )}
              </ChatBubble>
            </div>
          );
        })
      )}
      {isRunning && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
