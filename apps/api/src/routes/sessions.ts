import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { prisma } from '@brickops/db';
import { bus } from '@brickops/events';
import { AgentRuntime } from '@brickops/agent-runtime';
import type { ExecuteEvent } from '@brickops/agent-runtime';
import { createProvider, createTools, createSessionService, createMessageService } from '../session-bridge';

const runtime = new AgentRuntime();

export const sessionRoutes = new Hono();

// ── Create a session ──
sessionRoutes.post('/', async (c) => {
  const body = await c.req.json() as { projectId: string; source?: string; title?: string };
  const { projectId, source, title } = body;
  if (!projectId) return c.json({ error: 'projectId is required' }, 400);

  const session = await prisma.session.create({
    data: {
      projectId,
      source: source || 'web',
      title: title || null,
    },
  });

  return c.json({
    id: session.id,
    projectId: session.projectId,
    title: session.title,
    source: session.source,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
  });
});

// ── List all sessions ──
sessionRoutes.get('/', async (c) => {
  const sessions = await prisma.session.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: { project: { select: { name: true } } },
  });
  return c.json(sessions.map(s => ({
    id: s.id,
    projectId: s.projectId,
    title: s.title,
    source: s.source,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    projectName: (s as any).project?.name || null,
  })));
});

// ── Start a run ──
sessionRoutes.post('/:id/run', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json() as { prompt: string; projectId?: string };
  const { prompt, projectId } = body;

  if (!prompt) return c.json({ error: 'prompt is required' }, 400);

  // Ensure session exists
  let session = await prisma.session.findUnique({ where: { id } });
  if (!session) {
    session = await prisma.session.create({
      data: { id, projectId: projectId || 'unknown', source: 'web' },
    });
  }

  if (runtime.isSessionBusy(id)) {
    return c.json({ error: 'Session is busy' }, 409);
  }

  const provider = createProvider();
  const tools = createTools();
  const sessions = createSessionService(id);
  const messages = createMessageService(id);

  // Fire-and-forget the run (events stream back via bus → SSE)
  (async () => {
    try {
      const ts = Date.now();
      bus.emit({
        type: 'session.run_started',
        sessionId: id,
        projectId: session.projectId,
        runId: id,
        prompt,
        timestamp: ts,
      } as any);

      // Persist user prompt
      try {
        await prisma.sessionMessage.create({ data: { sessionId: id, role: 'user', content: prompt } });
      } catch {}

      const emitBus = (event: Record<string, unknown>) => { bus.emit(event as any); };

      const gen = runtime.execute(provider, tools, sessions, messages, { sessionId: id, content: prompt, emit: emitBus });
      for await (const evt of gen) {
        if (evt.type === 'response' && evt.done) {
          const summary = evt.message?.parts?.find(p => p.type === 'text')?.text || '';
          bus.emit({
            type: 'session.run_completed',
            sessionId: id,
            projectId: session.projectId,
            runId: id,
            summary,
            timestamp: Date.now(),
          } as any);
          // Persist assistant response
          if (summary) {
            try {
              await prisma.sessionMessage.create({ data: { sessionId: id, role: 'assistant', content: summary } });
            } catch {}
          }
        }
        if (evt.type === 'error') {
          const errMsg = (evt as any).error?.message || 'Unknown error';
          bus.emit({
            type: 'session.error',
            sessionId: id,
            runId: id,
            message: errMsg,
            timestamp: Date.now(),
          } as any);
          // Persist error
          try {
            await prisma.sessionMessage.create({ data: { sessionId: id, role: 'system', content: `Error: ${errMsg}` } });
          } catch {}
        }
      }
    } catch (err: any) {
      bus.emit({
        type: 'session.error',
        sessionId: id,
        runId: id,
        message: err.message,
        timestamp: Date.now(),
      } as any);
    }
  })();

  return c.json({ ok: true, sessionId: id });
});

// ── Get session with message history ──
sessionRoutes.get('/:id/history', async (c) => {
  const { id } = c.req.param();

  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return c.json({ messages: [], timeline: [], status: 'idle' });

  // Fetch persisted messages
  const dbMessages = await prisma.sessionMessage.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: 'asc' },
  });

  // Fetch recent run steps for timeline
  const timeline = await prisma.runStep.findMany({
    where: { run: { projectId: session.projectId } },
    orderBy: { startedAt: 'desc' },
    take: 50,
    include: { run: { select: { projectId: true } } },
  });

  return c.json({
    messages: dbMessages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.createdAt.getTime(),
    })),
    timeline: timeline.map(s => ({
      id: s.id,
      kind: 'run.step_changed' as const,
      title: s.name,
      description: s.status,
      timestamp: s.startedAt.getTime(),
      runId: s.runId,
    })),
    status: session.status,
  });
});

// ── Cancel a run ──
sessionRoutes.post('/:id/cancel', (c) => {
  const { id } = c.req.param();
  runtime.cancel(id);
  return c.json({ ok: true });
});

// ── Event stream ──
sessionRoutes.get('/:id/events', async (c) => {
  const { id } = c.req.param();
  const since = c.req.query('since');

  return streamSSE(c, async (stream) => {
    let alive = true;

    const handler = (event: any) => {
      if (!alive) return;
      if (event.sessionId !== id) return;

      void stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      });
    };

    bus.onAny(handler);

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (!alive) { clearInterval(heartbeat); return; }
      void stream.writeSSE({
        event: 'heartbeat',
        data: JSON.stringify({ timestamp: Date.now() }),
      });
    }, 30000);

    stream.onAbort(() => {
      alive = false;
      clearInterval(heartbeat);
      bus.offAny(handler);
    });

    while (alive) {
      await new Promise<void>(r => setTimeout(r, 1000));
    }
  });
});
