import { useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@brickops/ui';
import { Rocket, X, ChevronLeft, ChevronRight, GitBranch, Cpu, Globe, Smartphone, CheckCircle2, Box, Code, User, TestTube, Settings } from 'lucide-react';

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 'var(--bo-z-overlay)',
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--bo-space-4)',
};

const dialogStyle: CSSProperties = {
  background: 'var(--bo-bg-surface)',
  borderRadius: 'var(--bo-radius-md)',
  border: '1px solid var(--bo-border)',
  width: '100%',
  maxWidth: '600px',
  maxHeight: '90dvh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: 'var(--bo-shadow-lg)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--bo-space-4) var(--bo-space-5)',
  borderBottom: '1px solid var(--bo-border)',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--bo-text-lg)',
  fontWeight: 700,
  color: 'var(--bo-text)',
  margin: 0,
};

const bodyStyle: CSSProperties = {
  padding: 'var(--bo-space-5)',
  overflow: 'auto',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-4)',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--bo-space-4) var(--bo-space-5)',
  borderTop: '1px solid var(--bo-border)',
};

const stepIndicator: CSSProperties = {
  display: 'flex',
  gap: 'var(--bo-space-2)',
  padding: 'var(--bo-space-3) var(--bo-space-5)',
  borderBottom: '1px solid var(--bo-border)',
  background: 'var(--bo-bg-raised)',
};

const stepLabel = (active: boolean): CSSProperties => ({
  fontSize: 'var(--bo-text-xs)',
  fontWeight: active ? 600 : 400,
  color: active ? 'var(--bo-accent)' : 'var(--bo-text-tertiary)',
});

const fieldGroup: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-2)',
};

const labelStyle: CSSProperties = {
  fontSize: 'var(--bo-text-sm)',
  fontWeight: 500,
  color: 'var(--bo-text)',
};

const inputBase: CSSProperties = {
  width: '100%',
  padding: 'var(--bo-space-3) var(--bo-space-4)',
  borderRadius: 'var(--bo-radius-sm)',
  border: '1px solid var(--bo-border)',
  background: 'var(--bo-bg-input)',
  color: 'var(--bo-text)',
  fontSize: 'var(--bo-text-base)',
  outline: 'none',
  minHeight: 'var(--bo-tap-target)',
  boxSizing: 'border-box',
};

const iconBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: 'var(--bo-radius-sm)',
  color: 'var(--bo-text-secondary)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
};

const reviewCard: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-3)',
  padding: 'var(--bo-space-3)',
  borderRadius: 'var(--bo-radius-sm)',
  background: 'var(--bo-bg-raised)',
  border: '1px solid var(--bo-border)',
};

const personaCard = (selected: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-1)',
  padding: 'var(--bo-space-3)',
  borderRadius: 'var(--bo-radius-sm)',
  border: `1px solid ${selected ? 'var(--bo-accent)' : 'var(--bo-border)'}`,
  background: selected ? 'var(--bo-accent-bg)' : 'var(--bo-bg-raised)',
  cursor: 'pointer',
  transition: 'all var(--bo-transition-fast)',
});

const templateCard = (selected: boolean): CSSProperties => ({
  ...personaCard(selected),
  flexDirection: 'row',
  alignItems: 'center',
  gap: 'var(--bo-space-3)',
});

const STEPS_ICONS: Record<number, React.ReactNode> = {
  0: <Box size={12} />,
  1: <GitBranch size={12} />,
  2: <Cpu size={12} />,
  3: <CheckCircle2 size={12} />,
};

interface CreateProjectModalProps {
  onClose: () => void;
}

export function CreateProjectModal({ onClose }: CreateProjectModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [appName, setAppName] = useState('');
  const [description, setDescription] = useState('');
  const stack = 'auto';
  const [repoMode, setRepoMode] = useState<'new' | 'existing' | 'template'>('new');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [template, setTemplate] = useState('next');
  const [persona, setPersona] = useState('coder');
  const [defaultModel, setDefaultModel] = useState('auto');
  const [channelWeb, setChannelWeb] = useState(true);
  const [channelWhatsApp, setChannelWhatsApp] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [tags, setTags] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!appName.trim()) return;
    setSubmitted(true);
    try {
      const res = await fetch('http://localhost:3001/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: appName.trim(),
          description,
          source: 'web',
          stack: stack !== 'auto' ? stack : undefined,
          repoUrl: repoMode === 'existing' ? repoUrl : undefined,
          branch: repoMode === 'existing' ? branch : undefined,
          template: repoMode === 'template' ? template : undefined,
          persona,
          model: defaultModel !== 'auto' ? defaultModel : undefined,
          channels: channelWhatsApp ? ['web', 'whatsapp'] : ['web'],
          tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        navigate(`/project/${data.slug}`);
      } else {
        setSubmitted(false);
      }
    } catch {
      setSubmitted(false);
    }
  }

  const canNext = (): boolean => {
    switch (step) {
      case 0: return appName.trim().length > 0;
      case 1: return true;
      case 2: return true;
      default: return true;
    }
  };

  if (submitted) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...dialogStyle, maxWidth: '400px', alignItems: 'center', textAlign: 'center', padding: 'var(--bo-space-6)' }}>
          <Rocket size={40} style={{ color: 'var(--bo-accent)' }} />
          <h2 style={{ ...titleStyle, marginTop: 'var(--bo-space-3)' }}>Setting up workspace…</h2>
          <p style={{ fontSize: 'var(--bo-text-sm)', color: 'var(--bo-text-secondary)' }}>Creating your app and preparing the environment.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={handleSubmit} style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={titleStyle}>New App</h2>
          <button type="button" style={iconBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div style={stepIndicator}>
          {['Basics', 'Workspace', 'Agent', 'Review'].map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-1)' }}>
              {i > 0 && <span style={{ width: '16px', height: '1px', background: i <= step ? 'var(--bo-accent)' : 'var(--bo-border)', marginRight: 'var(--bo-space-1)' }} />}
              <span style={{ color: step >= i ? 'var(--bo-accent)' : 'var(--bo-text-tertiary)', display: 'flex' }}>{STEPS_ICONS[i]}</span>
              <span style={stepLabel(i === step)}>{s}</span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* Step 1: Basics */}
          {step === 0 && (
            <>
              <div style={fieldGroup}>
                <label style={labelStyle}>App name</label>
                <input
                  style={inputBase}
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="e.g. Todo Manager"
                  autoFocus
                />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Description</label>
                <textarea
                  style={{ ...inputBase, minHeight: '80px', resize: 'vertical', lineHeight: '1.5' }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What should this app do? Features, tech, constraints..."
                />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Tags (optional)</label>
                <input
                  style={inputBase}
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="internal tool, landing page, dashboard"
                />
              </div>
            </>
          )}

          {/* Step 2: Codebase / Workspace */}
          {step === 1 && (
            <>
              <div style={fieldGroup}>
                <label style={labelStyle}>Workspace setup</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-2)' }}>
                  <div style={templateCard(repoMode === 'new')} onClick={() => setRepoMode('new')}>
                    <Box size={20} style={{ color: 'var(--bo-accent)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-text)' }}>New blank app</div>
                      <div style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-secondary)' }}>BrickOps creates a new workspace from scratch.</div>
                    </div>
                  </div>
                  <div style={templateCard(repoMode === 'template')} onClick={() => setRepoMode('template')}>
                    <Code size={20} style={{ color: 'var(--bo-accent)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-text)' }}>Scaffold from template</div>
                      <div style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-secondary)' }}>Next.js, Remix, Vite, and more.</div>
                    </div>
                  </div>
                  <div style={templateCard(repoMode === 'existing')} onClick={() => setRepoMode('existing')}>
                    <GitBranch size={20} style={{ color: 'var(--bo-accent)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-text)' }}>Connect existing repo</div>
                      <div style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-secondary)' }}>Git URL with branch.</div>
                    </div>
                  </div>
                </div>
              </div>

              {repoMode === 'template' && (
                <div style={fieldGroup}>
                  <label style={labelStyle}>Template</label>
                  <select style={{ ...inputBase, appearance: 'none' }} value={template} onChange={(e) => setTemplate(e.target.value)}>
                    <option value="next">Next.js App</option>
                    <option value="vite-react">Vite + React</option>
                    <option value="remix">Remix</option>
                    <option value="express">Express API</option>
                  </select>
                </div>
              )}

              {repoMode === 'existing' && (
                <>
                  <div style={fieldGroup}>
                    <label style={labelStyle}>Git URL</label>
                    <input style={inputBase} value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/user/repo" />
                  </div>
                  <div style={fieldGroup}>
                    <label style={labelStyle}>Branch</label>
                    <input style={inputBase} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
                  </div>
                  <p style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)', margin: 0 }}>
                    BrickOps won't run anything until you confirm changes.
                  </p>
                </>
              )}
            </>
          )}

          {/* Step 3: Agent setup */}
          {step === 2 && (
            <>
              <div style={fieldGroup}>
                <label style={labelStyle}>Persona</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--bo-space-2)' }}>
                  {[
                    { id: 'coder', icon: <Code size={18} />, name: 'Coder', desc: 'Full-stack implementation' },
                    { id: 'refactorer', icon: <TestTube size={18} />, name: 'Refactorer', desc: 'Optimize existing code' },
                    { id: 'test-writer', icon: <User size={18} />, name: 'Test Writer', desc: 'Write and fix tests' },
                    { id: 'reviewer', icon: <Settings size={18} />, name: 'Reviewer', desc: 'Code review & audit' },
                  ].map(p => (
                    <div key={p.id} style={personaCard(persona === p.id)} onClick={() => setPersona(p.id)}>
                      <span style={{ color: persona === p.id ? 'var(--bo-accent)' : 'var(--bo-text-tertiary)' }}>
                        {p.icon}
                      </span>
                      <div style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-text)' }}>{p.name}</div>
                      <div style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-secondary)' }}>{p.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={fieldGroup}>
                <label style={labelStyle}>Default model</label>
                <select style={{ ...inputBase, appearance: 'none' }} value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)}>
                  <option value="auto">Auto (BrickOps-recommended)</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="claude-sonnet">Claude Sonnet</option>
                  <option value="claude-opus">Claude Opus</option>
                </select>
              </div>

              <div style={fieldGroup}>
                <label style={labelStyle}>Channels</label>
                <div style={{ display: 'flex', gap: 'var(--bo-space-3)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-2)', cursor: 'pointer', fontSize: 'var(--bo-text-sm)' }}>
                    <input type="checkbox" checked={channelWeb} onChange={(e) => setChannelWeb(e.target.checked)} style={{ accentColor: 'var(--bo-accent)' }} />
                    <Globe size={14} /> Web UI
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-2)', cursor: 'pointer', fontSize: 'var(--bo-text-sm)' }}>
                    <input type="checkbox" checked={channelWhatsApp} onChange={(e) => setChannelWhatsApp(e.target.checked)} style={{ accentColor: 'var(--bo-accent)' }} />
                    <Smartphone size={14} /> WhatsApp
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Step 4: Review */}
          {step === 3 && (
            <>
              <p style={{ fontSize: 'var(--bo-text-sm)', color: 'var(--bo-text-secondary)', margin: 0 }}>
                Review your choices before creating the app.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-2)' }}>
                <div style={reviewCard}>
                  <Box size={18} style={{ color: 'var(--bo-accent)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-text)' }}>{appName || 'Unnamed App'}</div>
                    <div style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-secondary)' }}>{description || 'No description'}</div>
                  </div>
                </div>
                <div style={reviewCard}>
                  <GitBranch size={18} style={{ color: 'var(--bo-accent)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-text)' }}>
                      {repoMode === 'new' ? 'New blank workspace' : repoMode === 'template' ? `Template: ${template}` : `Repo: ${repoUrl || '—'}`}
                    </div>
                    <div style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-secondary)' }}>
                      Stack: {stack === 'auto' ? 'Auto-detect' : stack}
                    </div>
                  </div>
                </div>
                <div style={reviewCard}>
                  <Cpu size={18} style={{ color: 'var(--bo-accent)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-text)' }}>
                      Persona: {persona}
                    </div>
                    <div style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-secondary)' }}>
                      {channelWeb && channelWhatsApp ? 'Web + WhatsApp' : channelWeb ? 'Web only' : 'WhatsApp only'}
                      {defaultModel !== 'auto' ? ` · Model: ${defaultModel}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <Button type="button" variant="outlined" size="sm" onClick={step === 0 ? onClose : () => setStep(s => s - 1)}>
            {step > 0 ? <><ChevronLeft size={14} /> Back</> : 'Cancel'}
          </Button>
          <div style={{ display: 'flex', gap: 'var(--bo-space-2)' }}>
            {step < 3 ? (
              <Button type="button" variant="filled" size="sm" disabled={!canNext()} onClick={() => setStep(s => s + 1)}>
                Next <ChevronRight size={14} />
              </Button>
            ) : (
              <Button type="submit" variant="filled" size="sm" disabled={!appName.trim()} icon={<Rocket size={14} />}>
                Create app & open workspace
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
