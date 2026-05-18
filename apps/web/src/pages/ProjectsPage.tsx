import { useState, useMemo, type CSSProperties } from 'react';
import { PageHeader, ProjectCard, EmptyState, StatCard, Input, FilterTabs, Badge, Button } from '@brickops/ui';
import { Plus, Search, FolderKanban, Activity, ShieldAlert, FolderCog, GitBranch } from 'lucide-react';
import { useProjects } from '../hooks/useProjects';
import { CreateProjectModal } from '../components/CreateProjectModal';

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bo-space-5)',
  paddingBottom: 'var(--bo-space-6)',
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
  borderBottom: '1px solid var(--bo-border)',
  paddingBottom: 'var(--bo-space-3)',
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

const fabStyle: CSSProperties = {
  position: 'fixed',
  bottom: 'calc(var(--bo-bottom-nav-height) + var(--bo-space-4))',
  right: 'var(--bo-space-4)',
  width: '56px',
  height: '56px',
  borderRadius: 'var(--bo-radius-md)',
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

const sourceIcons: Record<string, React.ReactNode> = {
  whatsapp: <span style={{ fontSize: 18, lineHeight: 1 }}>📱</span>,
  web: <span style={{ fontSize: 18, lineHeight: 1 }}>🌐</span>,
  github: <GitBranch size={18} />,
};

const typeIcons: Record<string, React.ReactNode> = {
  default: <FolderCog size={18} />,
};

const needsAttention = (status: string) =>
  status.includes('awaiting') || status.includes('pending') || status.includes('error');

const isActive = (status: string) =>
  status !== 'completed' && status !== 'cancelled';

export function ProjectsPage() {
  const { projects } = useProjects();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const totalCount = projects.length;
  const activeCount = projects.filter(p => isActive(p.status)).length;
  const attentionCount = projects.filter(p => needsAttention(p.status)).length;

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (activeTab === 'active' && !isActive(p.status)) return false;
      if (activeTab === 'attention' && !needsAttention(p.status)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return p.name?.toLowerCase().includes(q) || p.summary?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [projects, activeTab, searchQuery]);

  return (
    <div style={pageStyle}>
      <PageHeader
        title="Projects"
        subtitle="Manage and orchestrate your AI coding projects."
        actions={
          <Button variant="filled" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> New project
          </Button>
        }
      />

      <div style={statsGrid}>
        <StatCard label="Total Projects" value={totalCount} icon={<FolderKanban size={16} />} />
        <StatCard label="Active" value={activeCount} icon={<Activity size={16} />} />
        <StatCard label="Needs Attention" value={attentionCount} icon={<ShieldAlert size={16} />} />
      </div>

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

      {filteredProjects.length > 0 ? (
        <div style={projectGrid}>
          {filteredProjects.map((p) => (
            <ProjectCard
              key={p.id}
              id={p.id}
              name={p.name}
              description={p.summary}
              status={p.status}
              updatedAt={p.updatedAt}
              source={p.source}
              icon={sourceIcons[p.source] || typeIcons.default}
              badge={<Badge status={p.status} />}
              href={`/project/${p.slug}`}
              needsAttention={needsAttention(p.status)}
            />
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

      <button
        style={fabStyle}
        onClick={() => setShowCreateModal(true)}
        aria-label="Create new project"
        id="fab-new-project"
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <Plus size={28} />
      </button>

      {showCreateModal && <CreateProjectModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}
