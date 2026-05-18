import { useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@brickops/ui';
import { Rocket } from 'lucide-react';

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-5)', maxWidth: '420px', margin: '0 auto' };
const titleStyle: CSSProperties = { fontSize: 'var(--bo-text-xl)', fontWeight: 'var(--bo-weight-bold)' as any, color: 'var(--bo-text)' };
const subtitleStyle: CSSProperties = { fontSize: 'var(--bo-text-sm)', color: 'var(--bo-text-secondary)', marginTop: '-4px' };
const fieldGroup: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-2)' };
const labelStyle: CSSProperties = { fontSize: 'var(--bo-text-sm)', fontWeight: 'var(--bo-weight-medium)' as any, color: 'var(--bo-text)' };
const inputBase: CSSProperties = { width: '100%', padding: 'var(--bo-space-3) var(--bo-space-4)', borderRadius: 'var(--bo-radius-sm)', border: '1px solid var(--bo-border)', background: 'var(--bo-bg-input)', color: 'var(--bo-text)', fontSize: 'var(--bo-text-base)', outline: 'none', minHeight: 'var(--bo-tap-target)', boxSizing: 'border-box' };
const selectStyle: CSSProperties = { ...inputBase, appearance: 'none', paddingRight: '36px' };
const toggleGroup: CSSProperties = { display: 'flex', borderRadius: 'var(--bo-radius-sm)', border: '1px solid var(--bo-border)', overflow: 'hidden' };
const toggleBtn = (on: boolean): CSSProperties => ({ flex: 1, padding: 'var(--bo-space-3)', fontSize: 'var(--bo-text-sm)', fontWeight: on ? 'var(--bo-weight-semibold)' as any : 'var(--bo-weight-normal)' as any, background: on ? 'var(--bo-accent-bg)' : 'var(--bo-bg-raised)', color: on ? 'var(--bo-accent)' : 'var(--bo-text-secondary)', border: 'none', cursor: 'pointer', minHeight: 'var(--bo-tap-target)' });

export function CreateProjectPage() {
  const navigate = useNavigate();
  const [goal, setGoal] = useState('');
  const [stack, setStack] = useState('auto');
  const [repoMode, setRepoMode] = useState<'new' | 'existing'>('new');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!goal.trim()) return;
    setSubmitted(true);

    try {
      const res = await fetch('http://localhost:3001/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: goal.split('\n')[0].slice(0, 50) || 'New Project',
          description: goal,
          source: 'web',
          repoUrl: repoMode === 'existing' ? (document.getElementById('repo-url') as HTMLInputElement)?.value : undefined
        })
      });
      if (res.ok) {
        const data = await res.json();
        navigate(`/project/${data.slug}`);
      } else {
        setSubmitted(false);
        console.error('Failed to create project');
      }
    } catch (err) {
      setSubmitted(false);
      console.error(err);
    }
  }

  if (submitted) {
    return (
      <div style={{ ...pageStyle, alignItems: 'center', justifyContent: 'center', minHeight: '60dvh' }}>
        <Rocket size={40} style={{ color: 'var(--bo-accent)' }} />
        <h2 style={{ ...titleStyle, textAlign: 'center' }}>Creating project…</h2>
        <p style={{ ...subtitleStyle, textAlign: 'center' }}>Planning will begin shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={pageStyle}>
      <div><h1 style={titleStyle}>New Project</h1><p style={subtitleStyle}>Describe what you want to build.</p></div>
      <div style={fieldGroup}>
        <label htmlFor="project-goal" style={labelStyle}>What are you building?</label>
        <textarea id="project-goal" style={{ ...inputBase, minHeight: '120px', resize: 'vertical', lineHeight: '1.5' }}
          placeholder="A landing page for my sneaker marketplace with authentication, product grid, and Stripe checkout…"
          value={goal} onChange={(e) => setGoal(e.target.value)} autoFocus />
      </div>
      <div style={fieldGroup}>
        <label htmlFor="project-stack" style={labelStyle}>Stack preference</label>
        <select id="project-stack" style={selectStyle} value={stack} onChange={(e) => setStack(e.target.value)}>
          <option value="auto">Auto-detect (recommended)</option>
          <option value="react-node">React + Node.js</option>
          <option value="next">Next.js</option>
          <option value="react-vite">React + Vite</option>
          <option value="vanilla">Vanilla HTML/CSS/JS</option>
        </select>
      </div>
      <div style={fieldGroup}>
        <span style={labelStyle}>Repository</span>
        <div style={toggleGroup}>
          <button type="button" style={toggleBtn(repoMode === 'new')} onClick={() => setRepoMode('new')}>New repo</button>
          <button type="button" style={toggleBtn(repoMode === 'existing')} onClick={() => setRepoMode('existing')}>Existing repo</button>
        </div>
      </div>
      {repoMode === 'existing' && (
        <div style={fieldGroup}>
          <label htmlFor="repo-url" style={labelStyle}>Repository URL</label>
          <input id="repo-url" type="url" style={inputBase} placeholder="https://github.com/user/repo" />
        </div>
      )}
      <Button type="submit" variant="filled" size="lg" fullWidth disabled={!goal.trim()} icon={<Rocket size={18} />} id="submit-new-project">
        Create Project
      </Button>
    </form>
  );
}
