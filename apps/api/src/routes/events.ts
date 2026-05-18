import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { bus } from '@brickops/events';
import type { SystemEvent, SystemEventType } from '@brickops/events';
import type { SSEEvent, SSEEventType } from '@brickops/contracts';

/**
 * SSE realtime event stream.
 *
 * The web UI subscribes to this endpoint when viewing a project
 * to get live updates on run progress, approval requests, etc.
 *
 * Uses Hono's streamSSE helper for proper event-stream formatting.
 */

export const eventRoutes = new Hono();

// --- Global event stream (all projects) ---
eventRoutes.get('/', async (c) => {
  return streamSSE(c, async (stream) => {
    let alive = true;

    const handler = (event: SystemEvent) => {
      if (!alive) return;

      const sseEvent: SSEEvent = {
        type: mapEventType(event.type),
        data: event as unknown,
        timestamp: Date.now(),
      };

      void stream.writeSSE({
        event: sseEvent.type,
        data: JSON.stringify(sseEvent.data),
      });
    };

    bus.onAny(handler);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      if (!alive) {
        clearInterval(heartbeat);
        return;
      }
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

    // Block until stream is closed
    while (alive) {
      await new Promise<void>((r) => setTimeout(r, 1000));
    }
  });
});

// --- Project-scoped event stream ---
eventRoutes.get('/project/:projectId', async (c) => {
  const { projectId } = c.req.param();

  return streamSSE(c, async (stream) => {
    let alive = true;

    const handler = (event: SystemEvent) => {
      if (!alive) return;

      // Filter to only events for this project
      if ('projectId' in event && (event as Record<string, unknown>).projectId !== projectId) {
        return;
      }

      const sseEvent: SSEEvent = {
        type: mapEventType(event.type),
        data: event as unknown,
        timestamp: Date.now(),
      };

      void stream.writeSSE({
        event: sseEvent.type,
        data: JSON.stringify(sseEvent.data),
      });
    };

    bus.onAny(handler);

    // Send initial connection confirmation
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ projectId, timestamp: Date.now() }),
    });

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (!alive) {
        clearInterval(heartbeat);
        return;
      }
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
      await new Promise<void>((r) => setTimeout(r, 1000));
    }
  });
});

/**
 * Map internal event types to SSE event categories.
 */
function mapEventType(type: SystemEventType): SSEEventType {
  if (type.startsWith('run.')) return 'run.step';
  if (type === 'project.created') return 'project.created';
  if (type === 'project.updated') return 'project.updated';
  if (type.startsWith('project.')) return 'project.update';
  if (type === 'approval.requested') return 'approval.new';
  if (type === 'approval.resolved') return 'approval.resolved';
  if (type.startsWith('notification.')) return 'notification';
  if (type.startsWith('clarification.')) return 'project.update';
  if (type.startsWith('session.')) return 'session.run';
  if (type.startsWith('llm_')) return 'session.run';
  if (type.startsWith('tool_')) return 'session.run';
  if (type.startsWith('file_')) return 'session.run';
  if (type.startsWith('diff_')) return 'session.run';
  if (type.startsWith('tests_')) return 'session.run';
  return 'heartbeat';
}
