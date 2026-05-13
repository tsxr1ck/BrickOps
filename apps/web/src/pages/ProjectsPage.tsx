import { useState, useMemo, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, EmptyState, StatCard, Input, FilterTabs } from '@brickops/ui';
import { Plus, AlertCircle, Search, FolderKanban, Activity, ShieldAlert } from 'lucide-react';
import { useProjects } from '../hooks/useProjects';
import { timeAgo } from '../data/mock';

/* ─── Styles ─── */

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-5)',
  paddingBottom: 'var(--bo-space-6)',
};

const headerSection: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-3)',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--bo-text-2xl)',
  fontWeight: 'var(--bo-weight-bold)' as any,
  color: 'var(--bo-text-primary)',
  letterSpacing: '-0.5px',
};

const subtitleStyle: CSSProperties = {
  fontSize: 'var(--bo-text-base)',
  color: 'var(--bo-text-secondary)',
};

const statsGrid: CSSProperties = {
  display: 'flex',
  gap: 'var(--bo-space-3)',
  flexWrap: 'wrap',
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-3)',
  position: 'sticky',
  top: 'var(--bo-header-height)',
  background: 'var(--bo-bg-primary)',
  padding: 'var(--bo-space-2) 0',
  zIndex: 'var(--bo-z-sticky)' as any,
  borderBottom: '1px solid var(--bo-border)',
};

const searchRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--bo-space-3)',
  alignItems: 'center',
};

const projectGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 'var(--bo-space-4)',
};

const cardContent: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-3)',
  height: '100%',
};

const cardTopRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--bo-space-2)',
};

const projectName: CSSProperties = {
  fontSize: 'var(--bo-text-lg)',
  fontWeight: 'var(--bo-weight-semibold)' as any,
  color: 'var(--bo-text-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const summaryStyle: CSSProperties = {
  fontSize: 'var(--bo-text-sm)',
  color: 'var(--bo-text-secondary)',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  lineHeight: '1.5',
  flex: 1, // pushes meta row to bottom
};

const metaRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--bo-space-2)',
  marginTop: 'auto',
  paddingTop: 'var(--bo-space-3)',
  borderTop: '1px solid var(--bo-border)',
};

const metaText: CSSProperties = {
  fontSize: 'var(--bo-text-xs)',
  color: 'var(--bo-text-tertiary)',
  fontWeight: 'var(--bo-weight-medium)' as any,
};

const attentionBadge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: 'var(--bo-text-xs)',
  color: 'var(--bo-warning)',
  fontWeight: 'var(--bo-weight-medium)' as any,
};

const fabStyle: CSSProperties = {
  position: 'fixed',
  bottom: 'calc(var(--bo-bottom-nav-height) + var(--bo-space-4))',
  right: 'var(--bo-space-4)',
  width: '56px',
  height: '56px',
  borderRadius: 'var(--bo-radius-full)',
  background: 'var(--bo-accent)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: 'var(--bo-shadow-lg)',
  zIndex: 'var(--bo-z-fab)' as any,
  cursor: 'pointer',
  border: 'none',
  transition: 'transform var(--bo-transition-fast), background var(--bo-transition-fast)',
};

/* ─── Helpers ─── */

const needsAttention = (status: string) =>
  status.includes('awaiting') || status.includes('pending') || status.includes('error');

const isActive = (status: string) => 
  status !== 'completed' && status !== 'cancelled';

/* ─── Component ─── */

export function ProjectsPage() {
  const { projects } = useProjects();
  const navigate = useNavigate();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // Derived stats
  const totalCount = projects.length;
  const activeCount = projects.filter(p => isActive(p.status)).length;
  const attentionCount = projects.filter(p => needsAttention(p.status)).length;

  // Filtered list
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      // 1. Tab filter
      if (activeTab === 'active' && !isActive(p.status)) return false;
      if (activeTab === 'attention' && !needsAttention(p.status)) return false;
      
      // 2. Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          p.name?.toLowerCase().includes(query) ||
          p.summary?.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [projects, activeTab, searchQuery]);

  return (
    <div style={pageStyle}>
      {/* Header & Stats Dashboard */}
      <div style={headerSection}>
        <div>
          <h1 style={titleStyle}>Workspace</h1>
          <p style={subtitleStyle}>Manage and orchestrate your AI projects.</p>
        </div>
        
        <div style={statsGrid}>
          <StatCard 
            label="Total Projects" 
            value={totalCount} 
            icon={<FolderKanban size={16} />}
            accentColor="var(--bo-info)"
          />
          <StatCard 
            label="Active" 
            value={activeCount} 
            icon={<Activity size={16} />}
            accentColor="var(--bo-success)"
          />
          <StatCard 
            label="Needs Attention" 
            value={attentionCount} 
            icon={<ShieldAlert size={16} />}
            accentColor="var(--bo-warning)"
          />
        </div>
      </div>

      {/* Toolbar (Sticky) */}
      <div style={toolbarStyle}>
        <div style={searchRowStyle}>
          <div style={{ flex: 1 }}>
            <Input 
              placeholder="Search projects..." 
              icon={<Search size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <FilterTabs 
          options={[
            { id: 'all', label: 'All Projects' },
            { id: 'active', label: 'Active' },
            { id: 'attention', label: 'Needs Attention' },
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Content Grid */}
      {filteredProjects.length > 0 ? (
        <div style={projectGrid}>
          {filteredProjects.map((p) => (
            <Card
              key={p.id}
              variant="interactive"
              onClick={() => navigate(`/project/${p.slug}`)}
              id={`project-card-${p.slug}`}
              style={{ height: '100%' }}
            >
              <div style={cardContent}>
                <div style={cardTopRow}>
                  <span style={projectName} title={p.name}>{p.name}</span>
                  <Badge status={p.status} />
                </div>

                <p style={summaryStyle}>{p.summary}</p>

                <div style={metaRow}>
                  <span style={metaText}>
                    {p.source === 'whatsapp' ? '📱' : p.source === 'web' ? '🌐' : '📦'}{' '}
                    {timeAgo(p.updatedAt)}
                  </span>
                  {needsAttention(p.status) && (
                    <span style={attentionBadge}>
                      <AlertCircle size={14} /> Attention
                    </span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState 
          title="No projects found" 
          description={
            searchQuery || activeTab !== 'all' 
              ? "Try adjusting your filters or search query."
              : "You haven't created any projects yet. Let's get building."
          }
        />
      )}

      {/* Floating Action Button */}
      <button
        style={fabStyle}
        onClick={() => navigate('/new')}
        aria-label="Create new project"
        id="fab-new-project"
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <Plus size={28} />
      </button>
    </div>
  );
}
