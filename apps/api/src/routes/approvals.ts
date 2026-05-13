import { Hono } from 'hono';
import { prisma } from '@brickops/db';
import { bus } from '@brickops/events';
import { ApprovalAction } from '@brickops/contracts';

/**
 * Approval endpoints.
 *
 * Approvals are the primary human-in-the-loop mechanism.
 * The orchestrator creates them; the operator resolves them
 * from the web UI or WhatsApp.
 */

export const approvalRoutes = new Hono();

// --- List pending approvals ---
approvalRoutes.get('/', async (c) => {
  const status = c.req.query('status') || 'pending';

  const approvals = await prisma.approval.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    include: {
      project: { select: { id: true, name: true, slug: true, status: true } },
    },
  });

  return c.json(approvals);
});

// --- Get single approval ---
approvalRoutes.get('/:id', async (c) => {
  const { id } = c.req.param();

  const approval = await prisma.approval.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, slug: true, status: true } },
    },
  });

  if (!approval) {
    return c.json({ error: 'Approval not found' }, 404);
  }

  return c.json(approval);
});

// --- Resolve an approval (approve or reject) ---
approvalRoutes.post('/:id/resolve', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = ApprovalAction.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { decision, reason } = parsed.data;

  // Find the approval
  const existing = await prisma.approval.findUnique({ where: { id } });
  if (!existing) {
    return c.json({ error: 'Approval not found' }, 404);
  }

  if (existing.status !== 'pending') {
    return c.json({ error: `Approval already ${existing.status}` }, 409);
  }

  // Update the approval
  const approval = await prisma.approval.update({
    where: { id },
    data: {
      status: decision,
      approvedAt: decision === 'approved' ? new Date() : null,
    },
  });

  // If rejection had a reason, store it as a thread message
  if (decision === 'rejected' && reason) {
    await prisma.projectThread.create({
      data: {
        projectId: existing.projectId,
        role: 'user',
        content: `Rejected: ${reason}`,
      },
    });
  }

  // Emit event for orchestrator and notifications
  bus.emit({
    type: 'approval.resolved',
    approvalId: approval.id,
    projectId: approval.projectId,
    decision,
    timestamp: Date.now(),
  });

  return c.json(approval);
});
