import { describe, it, expect } from 'bun:test';
import * as templates from '../templates';

describe('notification templates', () => {
  const project: templates.ProjectInfo = {
    name: 'Relationship OS',
    slug: 'relationship-os',
    status: 'awaiting_plan_approval',
  };

  it('planApproval should produce compact approval card', () => {
    const msg = templates.planApproval(project, 'Full-stack app with auth and dashboard', 'medium');
    expect(msg).toContain('Plan Ready');
    expect(msg).toContain('Relationship OS');
    expect(msg).toContain('APPROVE relationship-os');
    expect(msg).toContain('REJECT relationship-os');
    expect(msg).toContain('/projects/relationship-os');
  });

  it('planApproval should show risk warning for high risk', () => {
    const msg = templates.planApproval(project, 'Deploys to prod', 'high');
    expect(msg).toContain('⚠️ Risk: HIGH');
  });

  it('buildFailed should include reason and logs link', () => {
    const msg = templates.buildFailed(project, 'TypeScript compilation error in auth.ts');
    expect(msg).toContain('Build Failed');
    expect(msg).toContain('TypeScript compilation error');
    expect(msg).toContain('/projects/relationship-os');
  });

  it('previewReady should include preview URL', () => {
    const msg = templates.previewReady(project, 'https://preview.byrick.net/abc');
    expect(msg).toContain('Preview Ready');
    expect(msg).toContain('https://preview.byrick.net/abc');
  });

  it('statusSummary should be compact', () => {
    const msg = templates.statusSummary(project, 'Generated 5 files');
    expect(msg).toContain('Relationship OS');
    expect(msg).toContain('awaiting_plan_approval');
    expect(msg).toContain('Generated 5 files');
  });

  it('projectCreated should confirm creation', () => {
    const msg = templates.projectCreated(project);
    expect(msg).toContain('Project Created');
    expect(msg).toContain('relationship-os');
    expect(msg).toContain('Planning will begin');
  });

  it('approvalResolved should show decision', () => {
    expect(templates.approvalResolved(project, 'approved')).toContain('✅');
    expect(templates.approvalResolved(project, 'approved')).toContain('Build will proceed');
    expect(templates.approvalResolved(project, 'rejected')).toContain('🚫');
  });

  it('projectList should format multiple projects', () => {
    const msg = templates.projectList([
      { name: 'Project A', status: 'active' },
      { name: 'Project B', status: 'planning' },
    ]);
    expect(msg).toContain('Your Projects');
    expect(msg).toContain('Project A');
    expect(msg).toContain('Project B');
    expect(msg).toContain('(2)');
  });

  it('projectList should handle empty list', () => {
    const msg = templates.projectList([]);
    expect(msg).toContain('No projects found');
  });
});
