import { Card, Badge, Button, EmptyState } from '@brickops/ui';
import { CheckCircle2 } from 'lucide-react';
import { useApprovals } from '../hooks/useProjects';
import { timeAgo } from '../data/mock';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-3)',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--bo-text-xl)',
  fontWeight: 'var(--bo-weight-bold)' as any,
  color: 'var(--bo-text)',
  marginBottom: 'var(--bo-space-2)',
};

const cardBody: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-3)',
};

const topRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--bo-space-2)',
};

const approvalTitle: CSSProperties = {
  fontSize: 'var(--bo-text-base)',
  fontWeight: 'var(--bo-weight-semibold)' as any,
  color: 'var(--bo-text)',
};

const projectLabel: CSSProperties = {
  fontSize: 'var(--bo-text-xs)',
  color: 'var(--bo-text-tertiary)',
};

const summaryText: CSSProperties = {
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-text-secondary)',
  lineHeight: '1.5',
};

const actionRow: CSSProperties = {
  display: 'flex',
  gap: 'var(--bo-space-3)',
};

const resolvedBanner: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bo-space-2)',
  padding: 'var(--bo-space-3)',
  borderRadius: 'var(--bo-radius-sm)',
  fontSize: 'var(--bo-text-sm)',
  fontWeight: 'var(--bo-weight-medium)' as any,
};

export function ApprovalsPage() {
  const { approvals, approve, reject } = useApprovals();
  const navigate = useNavigate();

  const pending = approvals.filter((a) => a.status === 'pending');
  const resolved = approvals.filter((a) => a.status !== 'pending');

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>
        Pending Approvals
        {pending.length > 0 && (
          <span style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 'var(--bo-weight-normal)' as any, color: 'var(--bo-text-tertiary)', marginLeft: 'var(--bo-space-2)' }}>
            ({pending.length})
          </span>
        )}
      </h1>

      {pending.length === 0 && (
        <EmptyState
          icon={<CheckCircle2 size={28} />}
          title="All clear"
          description="No pending approvals right now. You'll be notified when something needs your attention."
        />
      )}

      {pending.map((a) => (
        <Card key={a.id} variant="approval" id={`approval-${a.id}`}>
          <div style={cardBody}>
            <div style={topRow}>
              <div>
                <div style={approvalTitle}>{a.title}</div>
                <div
                  style={{ ...projectLabel, cursor: 'pointer' }}
                  onClick={() => navigate(`/project/${a.projectSlug}`)}
                >
                  {a.projectName}
                </div>
              </div>
              <Badge status={a.riskLevel} />
            </div>

            <p style={summaryText}>{a.summary}</p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={projectLabel}>{timeAgo(a.createdAt)}</span>
              <div style={actionRow}>
                <Button
                  variant="filled"
                  size="sm"
                  onClick={() => approve(a.id)}
                  id={`approve-btn-${a.id}`}
                >
                  ✓ Approve
                </Button>
                <Button
                  variant="outlined"
                  size="sm"
                  onClick={() => reject(a.id)}
                  id={`reject-btn-${a.id}`}
                  style={{ borderColor: 'var(--bo-error)', color: 'var(--bo-error)' }}
                >
                  ✕ Reject
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ))}

      {/* Resolved approvals */}
      {resolved.length > 0 && (
        <>
          <h2 style={{ ...titleStyle, fontSize: 'var(--bo-text-lg)', marginTop: 'var(--bo-space-4)' }}>
            Resolved
          </h2>
          {resolved.map((a) => (
            <Card key={a.id}>
              <div style={{
                ...resolvedBanner,
                background: a.status === 'approved' ? 'var(--bo-success-bg)' : 'var(--bo-error-bg)',
                color: a.status === 'approved' ? 'var(--bo-success)' : 'var(--bo-error)',
              }}>
                {a.status === 'approved' ? '✅' : '🚫'} {a.title} — {a.projectName}
                <span style={{ marginLeft: 'auto', fontSize: 'var(--bo-text-xs)', opacity: 0.7 }}>
                  {a.status}
                </span>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
