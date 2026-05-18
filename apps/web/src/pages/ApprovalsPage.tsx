import { Card, Badge, Button, EmptyState } from '@brickops/ui';
import { CheckCircle2, FileText, Clock, ArrowRight } from 'lucide-react';
import { useApprovals } from '../hooks/useProjects';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const splitLayout: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '360px 1fr',
  gap: 'var(--bo-space-4)',
  height: 'calc(100vh - 100px)',
  overflow: 'hidden',
};

const leftPanel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-2)',
  overflowY: 'auto',
  borderRight: '1px solid var(--bo-border)',
  paddingRight: 'var(--bo-space-3)',
};

const rightPanel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-4)',
  overflowY: 'auto',
  paddingLeft: 'var(--bo-space-1)',
};

const listItemStyle = (selected: boolean): CSSProperties => ({
  background: selected ? 'var(--bo-accent-bg)' : 'var(--bo-bg-surface)',
  border: `1px solid ${selected ? 'var(--bo-accent-border)' : 'var(--bo-border)'}`,
  borderRadius: 'var(--bo-radius-md)',
  padding: 'var(--bo-space-3)',
  cursor: 'pointer',
  transition: 'border-color var(--bo-transition-fast), background var(--bo-transition-fast)',
});

const fileItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '2px 0',
  fontSize: 'var(--bo-text-xs)',
  fontFamily: 'var(--bo-font-mono)',
  color: 'var(--bo-text-secondary)',
};

const headerTitle: CSSProperties = {
  fontSize: 'var(--bo-text-xl)',
  fontWeight: 700,
  color: 'var(--bo-text)',
  marginBottom: 'var(--bo-space-2)',
};

export function ApprovalsPage() {
  const { approvals, approve, reject } = useApprovals();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pending = approvals.filter((a) => a.status === 'pending');

  const selected = selectedId
    ? pending.find((a) => a.id === selectedId)
    : pending[0] || null;

  // Auto-select first pending item
  if (!selectedId && pending.length > 0 && pending[0]?.id !== selectedId) {
    // handled via effect below
  }

  return (
    <div>
      <h1 style={headerTitle}>
        Pending Approvals
        {pending.length > 0 && (
          <span style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 400, color: 'var(--bo-text-tertiary)', marginLeft: 'var(--bo-space-2)' }}>
            ({pending.length})
          </span>
        )}
      </h1>

      {pending.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={28} />}
          title="All clear"
          description="No pending approvals right now."
        />
      ) : (
        <div style={splitLayout}>
          {/* Left: list */}
          <div style={leftPanel}>
            {pending.map((a) => (
              <div
                key={a.id}
                style={listItemStyle(selected?.id === a.id)}
                onClick={() => setSelectedId(a.id)}
                id={`approval-item-${a.id}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--bo-space-1)' }}>
                  <span style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.title}
                  </span>
                  <Badge status={a.riskLevel} />
                </div>
                <div style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)' }}>
                  {a.projectName}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: 'var(--bo-space-2)', fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)' }}>
                  <Clock size={11} />
                  {timeAgo(a.createdAt)}
                  {a.files?.length > 0 && (
                    <>
                      <span style={{ margin: '0 4px' }}>·</span>
                      <FileText size={11} />
                      {a.files.length} file{a.files.length !== 1 ? 's' : ''}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Right: detail */}
          {selected && (
            <div key={selected.id} style={rightPanel}>
              <Card variant="approval" id={`approval-detail-${selected.id}`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--bo-space-2)' }}>
                    <div>
                      <div style={{ fontSize: 'var(--bo-text-lg)', fontWeight: 700, color: 'var(--bo-text)' }}>
                        {selected.title}
                      </div>
                      <div
                        style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)', cursor: 'pointer', marginTop: 'var(--bo-space-1)' }}
                        onClick={() => navigate(`/project/${selected.projectSlug}`)}
                      >
                        {selected.projectName} <ArrowRight size={10} style={{ display: 'inline' }} />
                      </div>
                    </div>
                    <Badge status={selected.riskLevel} />
                  </div>

                  <p style={{ fontSize: 'var(--bo-text-sm)', color: 'var(--bo-text-secondary)', lineHeight: '1.6', margin: 0 }}>
                    {selected.summary}
                  </p>

                  {selected.files?.length > 0 && (
                    <div style={{
                      background: 'var(--bo-bg-raised)',
                      borderRadius: 'var(--bo-radius-sm)',
                      border: '1px solid var(--bo-border)',
                      padding: 'var(--bo-space-3)',
                    }}>
                      <div style={{ fontSize: 'var(--bo-text-xs)', fontWeight: 600, color: 'var(--bo-text-tertiary)', marginBottom: 'var(--bo-space-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Changed Files
                      </div>
                      {selected.files.map((f: string, i: number) => (
                        <div key={i} style={fileItem}>
                          <FileText size={11} />
                          {f}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 'var(--bo-space-2)', borderTop: '1px solid var(--bo-border)' }}>
                    <span style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      Created {timeAgo(selected.createdAt)}
                    </span>
                    <div style={{ display: 'flex', gap: 'var(--bo-space-2)' }}>
                      <Button
                        variant="filled"
                        size="sm"
                        onClick={() => reject(selected.id)}
                        id={`reject-btn-${selected.id}`}
                        style={{ borderColor: 'var(--bo-error)', color: 'var(--bo-error)', background: 'transparent' }}
                      >
                        ✕ Reject
                      </Button>
                      <Button
                        variant="filled"
                        size="sm"
                        onClick={() => approve(selected.id)}
                        id={`approve-btn-${selected.id}`}
                      >
                        ✓ Approve
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Resolved */}
      {(() => {
        const resolved = approvals.filter((a) => a.status !== 'pending');
        if (resolved.length === 0) return null;
        return (
          <>
            <h2 style={{ fontSize: 'var(--bo-text-lg)', fontWeight: 700, color: 'var(--bo-text)', marginTop: 'var(--bo-space-6)', marginBottom: 'var(--bo-space-3)' }}>
              Resolved
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-2)' }}>
              {resolved.map((a) => (
                <Card key={a.id} variant="outlined">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--bo-space-2)',
                    fontSize: 'var(--bo-text-sm)',
                  }}>
                    <span>{a.status === 'approved' ? '✅' : '🚫'}</span>
                    <span style={{ fontWeight: 500, color: 'var(--bo-text)' }}>{a.title}</span>
                    <span style={{ color: 'var(--bo-text-tertiary)' }}>— {a.projectName}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)' }}>
                      {a.status}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}
