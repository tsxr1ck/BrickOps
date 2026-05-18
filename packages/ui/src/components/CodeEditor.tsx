import { type CSSProperties, useRef } from 'react';

const LANG_EXT_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', css: 'css', html: 'html',
  py: 'python', rs: 'rust', go: 'go', yml: 'yaml', yaml: 'yaml',
  toml: 'toml', sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'sql', graphql: 'graphql', svelte: 'html', vue: 'html',
};

function detectLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return LANG_EXT_MAP[ext] || '';
}

interface CodeEditorProps {
  filename: string;
  content: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  modified?: boolean;
  height?: string;
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  background: 'var(--bo-bg)',
  fontFamily: 'var(--bo-font-mono)',
  fontSize: 'var(--bo-text-sm)',
  lineHeight: 1.6,
  position: 'relative',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-2)',
  padding: 'var(--bo-space-1) var(--bo-space-3)',
  borderBottom: '1px solid var(--bo-border)',
  background: 'var(--bo-bg-raised)',
  flexShrink: 0,
  fontSize: 'var(--bo-text-xs)',
};

const langTagStyle: CSSProperties = {
  padding: '1px 6px',
  borderRadius: 'var(--bo-radius-sm)',
  background: 'var(--bo-accent-bg)',
  color: 'var(--bo-accent)',
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const modifiedDot: CSSProperties = {
  width: '8px', height: '8px', borderRadius: '50%',
  background: 'var(--bo-warning)', flexShrink: 0,
};

const lineNumbersStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: 'var(--bo-space-3) 0',
  textAlign: 'right',
  color: 'var(--bo-text-tertiary)',
  userSelect: 'none',
  minWidth: '40px',
  flexShrink: 0,
};

const codeAreaStyle: CSSProperties = {
  flex: 1,
  padding: 'var(--bo-space-3) var(--bo-space-4)',
  color: 'var(--bo-text)',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  resize: 'none',
  fontFamily: 'var(--bo-font-mono)',
  fontSize: 'var(--bo-text-sm)',
  lineHeight: 1.6,
  tabSize: 2,
  whiteSpace: 'pre-wrap',
  wordWrap: 'break-word',
};

export function CodeEditor({ filename, content, readOnly = true, onChange, modified, height }: CodeEditorProps) {
  const lang = detectLang(filename);
  const lines = content.split('\n');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div style={{ ...containerStyle, height: height || '100%' }}>
      <div style={headerStyle}>
        {modified && <div style={modifiedDot} title="Modified" />}
        <span style={{ color: 'var(--bo-text)', fontWeight: 500 }}>{filename}</span>
        {lang && <span style={langTagStyle}>{lang}</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--bo-text-tertiary)' }}>
          {lines.length} lines
        </span>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={lineNumbersStyle}>
          {lines.map((_, i) => (
            <div key={i} style={{ padding: '0 var(--bo-space-2)', lineHeight: 1.6 }}>
              {i + 1}
            </div>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={content}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          spellCheck={false}
          style={{
            ...codeAreaStyle,
            cursor: readOnly ? 'default' : 'text',
          }}
        />
      </div>
    </div>
  );
}
