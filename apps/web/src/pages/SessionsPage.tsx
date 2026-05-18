import { useState, useEffect, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, EmptyState, Input, StatCard, PageHeader } from '@brickops/ui';
import { History, Activity, Search, Clock, Play } from 'lucide-react';
const API_BASE = 'http://localhost:3001';

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-5)',
};

const statsGrid: CSSProperties = {
  display: 'flex',
  gap: 'var(--bo-space-3)',
  flexWrap: 'wrap',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 'var(--bo-text-sm)',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: 'var(--bo-space-3) var(--bo-space-3)',
  fontSize: 'var(--bo-text-xs)',
  fontWeight: 600,
  color: 'var(--bo-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '2px solid var(--bo-border)',
  whiteSpace: 'nowrap',
};

const tdStyle: CSSProperties = {
  padding: 'var(--bo-space-3)',
  borderBottom: '1px solid var(--bo-border)',
  color: 'var(--bo-text)',
  whiteSpace: 'nowrap',
};

const rowHover: CSSProperties = {
  cursor: 'pointer',
  transition: 'background var(--bo-transition-fast)',
};

const projectLink: CSSProperties = {
  color: 'var(--bo-accent)',
  fontWeight: 500,
};

const nameCell: CSSProperties = {
  maxWidth: '220px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--bo-text)',
  fontWeight: 500,
};

function formatDuration(started: string, updated: string): string {
  const diff = new Date(updated).getTime() - new Date(started).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

interface SessionRow {
  id: string;
  projectId: string;
  title: string | null;
  source: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  projectName?: string;
  projectSlug?: string;
  runs?: number;
}

export function SessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data || []);
      }
    } catch {}
  }

  const filtered = sessions.filter(s =>
    !search || s.id.toLowerCase().includes(search.toLowerCase()) ||
    s.projectName?.toLowerCase().includes(search.toLowerCase()) ||
    s.title?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={pageStyle}>
      <PageHeader title="Sessions" subtitle="Agent run history across all projects." />

      <div style={statsGrid}>
        <StatCard label="Total Sessions" value={sessions.length} icon={<History size={16} />} />
        <StatCard label="Active" value={sessions.filter(s => s.status === 'running').length} icon={<Activity size={16} />} />
      </div>

      <Input
        placeholder="Search sessions..."
        icon={<Search size={16} />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No sessions"
          description="Sessions are created when you start a new conversation or agent run."
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Project</th>
                <th style={thStyle}>Session</th>
                <th style={thStyle}>Channel</th>
                <th style={thStyle}>Started</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>Runs</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr
                  key={s.id}
                  style={rowHover}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bo-bg-raised)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => navigate(`/project/${s.projectSlug || s.projectId}?session=${s.id}`)}
                  id={`session-row-${s.id}`}
                >
                  <td style={tdStyle}>
                    <span style={projectLink}>{s.projectName || s.projectId}</span>
                  </td>
                  <td style={{ ...tdStyle, ...nameCell }} title={s.title || s.id}>
                    {s.title || s.id.slice(0, 24)}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-secondary)' }}>
                      {s.source === 'whatsapp' ? '📱 WhatsApp' : s.source === 'web' ? '🌐 Web' : '📦 API'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-secondary)' }}>
                      <Clock size={11} />
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-secondary)' }}>
                      {formatDuration(s.createdAt, s.updatedAt)}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-secondary)' }}>
                      <Play size={11} />
                      {s.runs ?? '—'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <Badge status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
