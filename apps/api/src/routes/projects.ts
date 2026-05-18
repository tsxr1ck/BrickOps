import { Hono } from 'hono';
import { prisma } from '@brickops/db';
import { bus } from '@brickops/events';
import { CreateProjectInput, UpdateProjectInput } from '@brickops/contracts';

/**
 * Project CRUD routes.
 *
 * All project data flows through here — web UI, WhatsApp gateway,
 * and orchestrator all consume these endpoints.
 */

export const projectRoutes = new Hono();

/**
 * Generate a URL-safe slug from a project name.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * Ensure slug uniqueness by appending a short suffix if needed.
 */
async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await prisma.project.findUnique({ where: { slug } });
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

// --- List all projects ---
projectRoutes.get('/', async (c) => {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { approvals: { where: { status: 'pending' } } } },
    },
  });

  const result = projects.map((p) => ({
    ...p,
    pendingApprovals: p._count.approvals,
    _count: undefined,
  }));

  return c.json(result);
});

// --- Get single project by slug or ID ---
projectRoutes.get('/:slugOrId', async (c) => {
  const { slugOrId } = c.req.param();

  const project = await prisma.project.findFirst({
    where: {
      OR: [{ slug: slugOrId }, { id: slugOrId }],
    },
    include: {
      threads: { orderBy: { createdAt: 'asc' } },
      runs: {
        orderBy: { startedAt: 'desc' },
        take: 1,
        include: { steps: { orderBy: { startedAt: 'asc' } } },
      },
      approvals: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json(project);
});

// --- Get or create current session for a project ---
projectRoutes.get('/:slugOrId/current-session', async (c) => {
  const { slugOrId } = c.req.param();

  const project = await prisma.project.findFirst({
    where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
  });
  if (!project) return c.json({ error: 'Project not found' }, 404);

  // Find the most recent session
  let session = await prisma.session.findFirst({
    where: { projectId: project.id },
    orderBy: { updatedAt: 'desc' },
  });

  if (!session) {
    session = await prisma.session.create({
      data: { projectId: project.id, source: 'web' },
    });
  }

  return c.json({ id: session.id });
});

// --- Create project ---
projectRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = CreateProjectInput.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { name, description, source, repoUrl } = parsed.data;
  const slug = await uniqueSlug(slugify(name));

  const project = await prisma.project.create({
    data: {
      name,
      slug,
      status: 'draft',
      source,
      repoUrl: repoUrl || null,
      // Store the description as the first thread message
      threads: {
        create: {
          role: 'user',
          content: description,
        },
      },
    },
    include: { threads: true },
  });

  // Emit event for orchestrator to pick up
  bus.emit({
    type: 'project.created',
    projectId: project.id,
    name: project.name,
    source: project.source as 'web' | 'whatsapp' | 'imported',
    timestamp: Date.now(),
  });

  return c.json(project, 201);
});

// --- Update project ---
projectRoutes.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = UpdateProjectInput.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  try {
    const project = await prisma.project.update({
      where: { id },
      data: parsed.data,
    });

    bus.emit({
      type: 'project.updated',
      projectId: project.id,
      status: project.status,
      timestamp: Date.now(),
    });

    return c.json(project);
  } catch (err: any) {
    if (err.code === 'P2025') {
      return c.json({ error: 'Project not found' }, 404);
    }
    throw err;
  }
});

// --- Add thread message to project ---
projectRoutes.post('/:id/threads', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{ role: string; content: string }>();

  if (!body.role || !body.content) {
    return c.json({ error: 'Missing role or content' }, 400);
  }

  try {
    const thread = await prisma.projectThread.create({
      data: {
        projectId: id,
        role: body.role,
        content: body.content,
      },
    });
    return c.json(thread, 201);
  } catch (err: any) {
    if (err.code === 'P2003') {
      return c.json({ error: 'Project not found' }, 404);
    }
    throw err;
  }
});

// --- Submit clarification answers (web UI) ---
projectRoutes.post('/:id/clarify', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{ answers: string[] }>();

  if (!body.answers || !Array.isArray(body.answers) || body.answers.length === 0) {
    return c.json({ error: 'answers array is required' }, 400);
  }

  try {
    const answers = body.answers.filter(a => a.trim());
    for (const answer of answers) {
      await prisma.projectThread.create({
        data: { projectId: id, role: 'user', content: answer.trim() },
      });
    }

    bus.emit({
      type: 'clarification.answered',
      projectId: id,
      answers,
      timestamp: Date.now(),
    });

    return c.json({ ok: true, message: 'Clarification answers submitted' }, 200);
  } catch (err: any) {
    if (err.code === 'P2003') {
      return c.json({ error: 'Project not found' }, 404);
    }
    throw err;
  }
});

// --- Web-based change request (modify project) ---
projectRoutes.post('/:id/modify', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{ message: string }>();

  if (!body.message?.trim()) {
    return c.json({ error: 'Missing message' }, 400);
  }

  try {
    // 1. Store the user request as a thread message
    await prisma.projectThread.create({
      data: {
        projectId: id,
        role: 'user',
        content: body.message,
      },
    });

    // 2. Fetch the project name for the event
    const project = await prisma.project.findUnique({
      where: { id },
      select: { name: true, source: true },
    });

    // 3. Emit project.created to trigger a new run
    // The orchestrator listens for this to start/continue the pipeline
    bus.emit({
      type: 'project.created',
      projectId: id,
      name: project?.name || 'unknown',
      source: (project?.source as 'web' | 'whatsapp' | 'imported') || 'web',
      timestamp: Date.now(),
    });

    return c.json({ ok: true, message: 'Change request submitted' }, 201);
  } catch (err: any) {
    if (err.code === 'P2003') {
      return c.json({ error: 'Project not found' }, 404);
    }
    throw err;
  }
});

// --- Delete (archive) project ---
projectRoutes.delete('/:id', async (c) => {
  const { id } = c.req.param();

  try {
    await prisma.project.delete({ where: { id } });
    return c.json({ ok: true });
  } catch (err: any) {
    if (err.code === 'P2025') {
      return c.json({ error: 'Project not found' }, 404);
    }
    throw err;
  }
});
