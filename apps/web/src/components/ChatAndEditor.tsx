import { type CSSProperties, useState } from 'react';
import { ChatTimeline, ChatInput, ChatBubble, CodeEditor, ThinkingStream, Button } from '@brickops/ui';
import type { ChatMessage, ThinkingStep } from '@brickops/ui';
import { FileCode, MessageSquare, SplitSquareHorizontal, Square } from 'lucide-react';

const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
};

const tabBar: CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--bo-border)',
  flexShrink: 0,
  background: 'var(--bo-bg)',
};

const tabStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: 'var(--bo-space-2) var(--bo-space-3)',
  fontSize: 'var(--bo-text-xs)',
  fontWeight: active ? 600 : 400,
  color: active ? 'var(--bo-accent)' : 'var(--bo-text-secondary)',
  background: 'none',
  border: 'none',
  borderBottom: `2px solid ${active ? 'var(--bo-accent)' : 'transparent'}`,
  cursor: 'pointer',
});

const editorPanel: CSSProperties = {
  height: '220px',
  borderTop: '1px solid var(--bo-border)',
  flexShrink: 0,
};

const runBannerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-2)',
  padding: 'var(--bo-space-2) var(--bo-space-3)',
  background: 'var(--bo-accent-bg)',
  borderBottom: '1px solid var(--bo-accent-border)',
  fontSize: 'var(--bo-text-xs)',
  fontWeight: 500,
  color: 'var(--bo-accent)',
  flexShrink: 0,
};

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: 'var(--bo-radius-sm)',
  border: '1px solid var(--bo-border)',
  fontSize: 'var(--bo-text-xs)',
  color: 'var(--bo-text-secondary)',
  background: 'var(--bo-bg-raised)',
  cursor: 'pointer',
  transition: 'all var(--bo-transition-fast)',
  whiteSpace: 'nowrap',
};

const chipsRow: CSSProperties = {
  display: 'flex',
  gap: 'var(--bo-space-2)',
  padding: 'var(--bo-space-2) var(--bo-space-4)',
  borderTop: '1px solid var(--bo-border)',
  background: 'var(--bo-bg)',
  flexWrap: 'wrap',
};

const completeBanner: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--bo-space-2)',
  padding: 'var(--bo-space-2) var(--bo-space-3)',
  background: 'var(--bo-bg-raised)',
  borderBottom: '1px solid var(--bo-border)',
  fontSize: 'var(--bo-text-xs)',
  flexShrink: 0,
};

interface ChatAndEditorProps {
  messages: ChatMessage[];
  isRunning: boolean;
  thinkingSteps: ThinkingStep[];
  onSend: () => void;
  inputValue: string;
  onInputChange: (val: string) => void;
  disabled: boolean;
  editorVisible: boolean;
  selectedFile: string | null;
  fileContent: string | null;
  fileLoading: boolean;
  runCount?: number;
  onApprove?: () => void;
  onRevert?: () => void;
  onCancelRun?: () => void;
}

const SUGGESTIONS = [
  'Scaffold the initial app',
  'Paste an existing spec',
  'Explain your existing repo',
];

export function ChatAndEditor({
  messages, isRunning, thinkingSteps, onSend, inputValue, onInputChange, disabled,
  editorVisible, selectedFile, fileContent, fileLoading,
  runCount = 0, onApprove, onRevert, onCancelRun,
}: ChatAndEditorProps) {
  const [viewMode, setViewMode] = useState<'chat' | 'editor' | 'split'>('chat');
  const [showSuggestions, setShowSuggestions] = useState(true);

  const showThinking = thinkingSteps.length > 0 && (isRunning || thinkingSteps.some(s => s.status === 'done'));
  const hasMessages = messages.length > 0;
  const showChips = !hasMessages && showSuggestions;
  const lastRunCompleted = runCount > 0 && !isRunning && hasMessages;
  const showRunBanner = isRunning;

  const handleChip = (text: string) => {
    onInputChange(text);
    setShowSuggestions(false);
  };

  return (
    <div style={container}>
      <div style={tabBar}>
        <button style={tabStyle(viewMode === 'chat')} onClick={() => setViewMode('chat')}>
          <MessageSquare size={12} /> Chat
        </button>
        <button style={tabStyle(viewMode === 'editor')} onClick={() => setViewMode('editor')}>
          <FileCode size={12} /> Editor
        </button>
        <button style={tabStyle(viewMode === 'split')} onClick={() => setViewMode('split')}>
          <SplitSquareHorizontal size={12} /> Split
        </button>
        {selectedFile && (
          <span style={{ marginLeft: 'auto', fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)', padding: 'var(--bo-space-2) var(--bo-space-3)', fontFamily: 'var(--bo-font-mono)' }}>
            {selectedFile}
          </span>
        )}
      </div>

      {/* Run banner */}
      {showRunBanner && (
        <div style={runBannerStyle}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bo-accent)', animation: 'bo-pulse 1.5s ease-in-out infinite' }} />
          <span>Run #{runCount} – Implementing plan…</span>
          <span style={{ flex: 1 }} />
          {onCancelRun && (
            <button
              onClick={onCancelRun}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid currentColor', borderRadius: 'var(--bo-radius-sm)', color: 'inherit', fontSize: 'var(--bo-text-xs)', padding: '2px 8px', cursor: 'pointer' }}
            >
              <Square size={10} /> Cancel
            </button>
          )}
        </div>
      )}

      {(viewMode === 'chat' || viewMode === 'split') && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 'var(--bo-space-2)' }}>
          {showThinking && (
            <div style={{ padding: '0 var(--bo-space-3)', paddingTop: 'var(--bo-space-2)' }}>
              <ThinkingStream steps={thinkingSteps} />
            </div>
          )}
          <ChatTimeline
            messages={messages}
            isRunning={isRunning}
            emptyState={
              <ChatBubble role="system">Describe what you want this app to do (features, tech, constraints)…</ChatBubble>
            }
          />

          {/* Approve / Revert after run completes */}
          {lastRunCompleted && (onApprove || onRevert) && (
            <div style={{ ...completeBanner, borderTop: '1px solid var(--bo-border)' }}>
              <span style={{ color: 'var(--bo-text-secondary)' }}>Run #{runCount} completed</span>
              <div style={{ display: 'flex', gap: 'var(--bo-space-2)' }}>
                {onRevert && (
                  <Button variant="outlined" size="sm" onClick={onRevert} style={{ borderColor: 'var(--bo-error)', color: 'var(--bo-error)' }}>
                    Revert this run
                  </Button>
                )}
                {onApprove && (
                  <Button variant="filled" size="sm" onClick={onApprove}>
                    Approve changes
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {(viewMode === 'editor' || viewMode === 'split') && editorVisible && selectedFile && (
        <div style={editorPanel}>
          {fileLoading ? (
            <div style={{ padding: 'var(--bo-space-4)', color: 'var(--bo-text-tertiary)', fontSize: 'var(--bo-text-sm)' }}>
              Loading...
            </div>
          ) : fileContent !== null ? (
            <CodeEditor filename={selectedFile} content={fileContent} readOnly />
          ) : null}
        </div>
      )}

      {/* Suggestion chips */}
      {showChips && (
        <div style={chipsRow}>
          <span style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)', display: 'flex', alignItems: 'center' }}>Suggestions:</span>
          {SUGGESTIONS.map(s => (
            <span key={s} style={chipStyle} onClick={() => handleChip(s)}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--bo-accent)'; e.currentTarget.style.color = 'var(--bo-accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--bo-border)'; e.currentTarget.style.color = 'var(--bo-text-secondary)'; }}
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--bo-border)', flexShrink: 0 }}>
        <ChatInput
          value={inputValue}
          onChange={onInputChange}
          onSend={onSend}
          disabled={disabled}
          placeholder={lastRunCompleted ? `Run #${runCount} finished. Ask a follow-up or start Run #${runCount + 1}.` : 'Describe what you want this app to do (features, tech, constraints)…'}
        />
      </div>
    </div>
  );
}
