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
        data: event as any,
        timestamp: Date.now(),
      };

      stream.writeSSE({
        event: sseEvent.type,
        data: JSON.stringify(sseEvent.data),
      }).catch(() => { alive = false; });
    };

    bus.onAny(handler);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      if (!alive) {
        clearInterval(heartbeat);
        return;
      }
      stream.writeSSE({
        event: 'heartbeat',
        data: JSON.stringify({ timestamp: Date.now() }),
      }).catch(() => { alive = false; });
    }, 30000);

    stream.onAbort(() => {
      alive = false;
      clearInterval(heartbeat);
      bus.offAny(handler);
    });

    // Block until stream is closed
    while (alive) {
      await new Promise((r) => setTimeout(r, 1000));
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
      if ('projectId' in event && (event as any).projectId !== projectId) {
        return;
      }

      const sseEvent: SSEEvent = {
        type: mapEventType(event.type),
        data: event as any,
        timestamp: Date.now(),
      };

      stream.writeSSE({
        event: sseEvent.type,
        data: JSON.stringify(sseEvent.data),
      }).catch(() => { alive = false; });
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
      stream.writeSSE({
        event: 'heartbeat',
        data: JSON.stringify({ timestamp: Date.now() }),
      }).catch(() => { alive = false; });
    }, 30000);

    stream.onAbort(() => {
      alive = false;
      clearInterval(heartbeat);
      bus.offAny(handler);
    });

    while (alive) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  });
});

/**
 * Map internal event types to SSE event categories.
 */
function mapEventType(type: SystemEventType): SSEEventType {
  if (type.startsWith('run.')) return 'run.step';
  if (type.startsWith('project.')) return 'project.update';
  if (type === 'approval.requested') return 'approval.new';
  if (type === 'approval.resolved') return 'approval.resolved';
  if (type.startsWith('notification.')) return 'notification';
  return 'heartbeat'; // fallback for unrecognized event types
}
