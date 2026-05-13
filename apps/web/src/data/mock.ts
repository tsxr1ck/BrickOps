/**
 * Mock data fixtures for the operator console.
 *
 * These drive the entire UI until the real API is wired up.
 * Structure mirrors the Prisma schema so the switch is seamless.
 */

export interface MockProject {
  id: string;
  name: string;
  slug: string;
  status: string;
  source: 'web' | 'whatsapp' | 'imported';
  repoUrl?: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  lastAction?: string;
}

export interface MockRun {
  id: string;
  projectId: string;
  currentStage: string;
  startedAt: string;
  finishedAt?: string;
  failureReason?: string;
  steps: MockRunStep[];
}

export interface MockRunStep {
  id: string;
  name: string;
  status: 'completed' | 'active' | 'pending' | 'failed';
  startedAt: string;
  endedAt?: string;
}

export interface MockApproval {
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  title: string;
  summary: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

/* ─── Projects ─── */
export const mockProjects: MockProject[] = [
  {
    id: 'p1',
    name: 'Relationship OS',
    slug: 'relationship-os',
    status: 'awaiting_plan_approval',
    source: 'whatsapp',
    createdAt: '2026-05-12T14:30:00Z',
    updatedAt: '2026-05-12T16:45:00Z',
    summary: 'Full-stack relationship management app with compatibility engine, couple questionnaire, and shared dashboard',
    lastAction: 'Plan generated — waiting for approval',
  },
  {
    id: 'p2',
    name: 'Sneaker Marketplace',
    slug: 'sneaker-marketplace',
    status: 'coding',
    source: 'web',
    createdAt: '2026-05-11T09:00:00Z',
    updatedAt: '2026-05-12T17:20:00Z',
    summary: 'Landing page with product grid, size selector, cart, and Stripe checkout',
    lastAction: 'Generating code — batch 2 of 3',
  },
  {
    id: 'p3',
    name: 'Fitness Tracker',
    slug: 'fitness-tracker',
    status: 'deployed',
    source: 'whatsapp',
    repoUrl: 'https://github.com/byrick/fitness-tracker',
    createdAt: '2026-05-08T11:00:00Z',
    updatedAt: '2026-05-10T15:30:00Z',
    summary: 'Progressive web app for tracking lifting sessions, personal records, and workout history',
    lastAction: 'Deployed to preview — all tests passing',
  },
  {
    id: 'p4',
    name: 'Volumetrico Dashboard',
    slug: 'volumetrico-dashboard',
    status: 'failed',
    source: 'imported',
    repoUrl: 'https://github.com/byrick/volumetrico',
    createdAt: '2026-05-05T08:00:00Z',
    updatedAt: '2026-05-12T10:15:00Z',
    summary: 'Gas station management platform — shift reports, financial reconciliation, and facility monitoring',
    lastAction: 'Build failed: TypeScript compilation error in reconciliation module',
  },
];

/* ─── Runs ─── */
export const mockRuns: Record<string, MockRun> = {
  p1: {
    id: 'r1',
    projectId: 'p1',
    currentStage: 'awaiting_plan_approval',
    startedAt: '2026-05-12T14:30:00Z',
    steps: [
      { id: 's1', name: 'Intake classification', status: 'completed', startedAt: '2026-05-12T14:30:00Z', endedAt: '2026-05-12T14:30:12Z' },
      { id: 's2', name: 'Architecture planning', status: 'completed', startedAt: '2026-05-12T14:30:12Z', endedAt: '2026-05-12T14:31:45Z' },
      { id: 's3', name: 'Plan review', status: 'completed', startedAt: '2026-05-12T14:31:45Z', endedAt: '2026-05-12T14:32:10Z' },
      { id: 's4', name: 'Awaiting approval', status: 'active', startedAt: '2026-05-12T14:32:10Z' },
      { id: 's5', name: 'Workspace provisioning', status: 'pending', startedAt: '' },
      { id: 's6', name: 'Code generation', status: 'pending', startedAt: '' },
      { id: 's7', name: 'Build & test', status: 'pending', startedAt: '' },
    ],
  },
  p2: {
    id: 'r2',
    projectId: 'p2',
    currentStage: 'coding',
    startedAt: '2026-05-11T09:05:00Z',
    steps: [
      { id: 's1', name: 'Intake classification', status: 'completed', startedAt: '2026-05-11T09:05:00Z', endedAt: '2026-05-11T09:05:08Z' },
      { id: 's2', name: 'Architecture planning', status: 'completed', startedAt: '2026-05-11T09:05:08Z', endedAt: '2026-05-11T09:06:30Z' },
      { id: 's3', name: 'Plan approved', status: 'completed', startedAt: '2026-05-11T09:06:30Z', endedAt: '2026-05-11T10:15:00Z' },
      { id: 's4', name: 'Workspace provisioning', status: 'completed', startedAt: '2026-05-11T10:15:00Z', endedAt: '2026-05-11T10:15:30Z' },
      { id: 's5', name: 'Code generation (batch 2/3)', status: 'active', startedAt: '2026-05-11T10:15:30Z' },
      { id: 's6', name: 'Code review', status: 'pending', startedAt: '' },
      { id: 's7', name: 'Build & test', status: 'pending', startedAt: '' },
    ],
  },
  p3: {
    id: 'r3',
    projectId: 'p3',
    currentStage: 'deployed',
    startedAt: '2026-05-08T11:05:00Z',
    finishedAt: '2026-05-10T15:30:00Z',
    steps: [
      { id: 's1', name: 'Intake classification', status: 'completed', startedAt: '2026-05-08T11:05:00Z', endedAt: '2026-05-08T11:05:10Z' },
      { id: 's2', name: 'Architecture planning', status: 'completed', startedAt: '2026-05-08T11:05:10Z', endedAt: '2026-05-08T11:07:00Z' },
      { id: 's3', name: 'Plan approved', status: 'completed', startedAt: '2026-05-08T11:07:00Z', endedAt: '2026-05-08T11:30:00Z' },
      { id: 's4', name: 'Code generation', status: 'completed', startedAt: '2026-05-08T11:30:00Z', endedAt: '2026-05-09T08:00:00Z' },
      { id: 's5', name: 'Code review', status: 'completed', startedAt: '2026-05-09T08:00:00Z', endedAt: '2026-05-09T08:02:00Z' },
      { id: 's6', name: 'Build & test', status: 'completed', startedAt: '2026-05-09T08:02:00Z', endedAt: '2026-05-09T08:05:00Z' },
      { id: 's7', name: 'Deployed', status: 'completed', startedAt: '2026-05-10T15:00:00Z', endedAt: '2026-05-10T15:30:00Z' },
    ],
  },
  p4: {
    id: 'r4',
    projectId: 'p4',
    currentStage: 'failed',
    startedAt: '2026-05-12T09:00:00Z',
    failureReason: 'TypeScript compilation error: Cannot find module \'./reconciliation\' in src/shifts/ShiftDetail.tsx',
    steps: [
      { id: 's1', name: 'Workspace indexing', status: 'completed', startedAt: '2026-05-12T09:00:00Z', endedAt: '2026-05-12T09:01:00Z' },
      { id: 's2', name: 'Context navigation', status: 'completed', startedAt: '2026-05-12T09:01:00Z', endedAt: '2026-05-12T09:01:30Z' },
      { id: 's3', name: 'Code patching', status: 'completed', startedAt: '2026-05-12T09:01:30Z', endedAt: '2026-05-12T09:03:00Z' },
      { id: 's4', name: 'Build & test', status: 'failed', startedAt: '2026-05-12T09:03:00Z', endedAt: '2026-05-12T09:03:45Z' },
    ],
  },
};

/* ─── Approvals ─── */
export const mockApprovals: MockApproval[] = [
  {
    id: 'a1',
    projectId: 'p1',
    projectName: 'Relationship OS',
    projectSlug: 'relationship-os',
    title: 'Implementation Plan',
    summary: 'Full-stack app with React frontend, Express API, PostgreSQL database. Includes auth (passkey), couple matching engine, compatibility questionnaire with scoring algorithm, shared dashboard with real-time sync.',
    riskLevel: 'medium',
    status: 'pending',
    createdAt: '2026-05-12T14:32:10Z',
  },
  {
    id: 'a2',
    projectId: 'p2',
    projectName: 'Sneaker Marketplace',
    projectSlug: 'sneaker-marketplace',
    title: 'Add Stripe integration',
    summary: 'Adds Stripe checkout flow with server-side payment intent creation. New dependency: stripe@14.0. Environment variable STRIPE_SECRET_KEY required.',
    riskLevel: 'high',
    status: 'pending',
    createdAt: '2026-05-12T17:20:00Z',
  },
];

/* ─── Helpers ─── */
export function getProject(slugOrId: string): MockProject | undefined {
  return mockProjects.find((p) => p.slug === slugOrId || p.id === slugOrId);
}

export function getRun(projectId: string): MockRun | undefined {
  return mockRuns[projectId];
}

export function getPendingApprovals(): MockApproval[] {
  return mockApprovals.filter((a) => a.status === 'pending');
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
