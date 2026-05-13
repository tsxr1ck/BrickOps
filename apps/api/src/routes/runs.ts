import { Hono } from 'hono';
import { prisma } from '@brickops/db';

/**
 * Run query routes.
 *
 * Runs represent a single orchestrator execution against a project.
 * Each run has steps (classification, planning, coding batches, etc).
 */

export const runRoutes = new Hono();

// --- List runs for a project ---
runRoutes.get('/project/:projectId', async (c) => {
  const { projectId } = c.req.param();

  const runs = await prisma.run.findMany({
    where: { projectId },
    orderBy: { startedAt: 'desc' },
    include: {
      steps: { orderBy: { startedAt: 'asc' } },
    },
  });

  return c.json(runs);
});

// --- Get single run with steps ---
runRoutes.get('/:id', async (c) => {
  const { id } = c.req.param();

  const run = await prisma.run.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { startedAt: 'asc' } },
      project: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!run) {
    return c.json({ error: 'Run not found' }, 404);
  }

  return c.json(run);
});
