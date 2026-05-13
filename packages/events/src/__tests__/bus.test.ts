import { describe, it, expect } from 'bun:test';
import { EventBus } from '../bus';

describe('EventBus', () => {
  it('should emit and receive typed events', () => {
    const bus = new EventBus();
    let received: any = null;

    bus.on('project.created', (event) => {
      received = event;
    });

    bus.emit({
      type: 'project.created',
      projectId: 'p1',
      name: 'Test Project',
      source: 'whatsapp',
      timestamp: Date.now(),
    });

    expect(received).not.toBeNull();
    expect(received.projectId).toBe('p1');
    expect(received.name).toBe('Test Project');
    expect(received.source).toBe('whatsapp');
  });

  it('should support once() for single-fire subscriptions', () => {
    const bus = new EventBus();
    let count = 0;

    bus.once('run.started', () => {
      count++;
    });

    const event = {
      type: 'run.started' as const,
      runId: 'r1',
      projectId: 'p1',
      timestamp: Date.now(),
    };

    bus.emit(event);
    bus.emit(event);

    expect(count).toBe(1);
  });

  it('should support wildcard listener via onAny()', () => {
    const bus = new EventBus();
    const events: string[] = [];

    bus.onAny((event) => {
      events.push(event.type);
    });

    bus.emit({ type: 'project.created', projectId: 'p1', name: 'X', source: 'web', timestamp: 0 });
    bus.emit({ type: 'run.started', runId: 'r1', projectId: 'p1', timestamp: 0 });

    expect(events).toEqual(['project.created', 'run.started']);
  });

  it('should not cross-fire between event types', () => {
    const bus = new EventBus();
    let fired = false;

    bus.on('run.failed', () => {
      fired = true;
    });

    bus.emit({ type: 'run.completed', runId: 'r1', projectId: 'p1', timestamp: 0 });

    expect(fired).toBe(false);
  });

  it('should support removeAll()', () => {
    const bus = new EventBus();
    let count = 0;

    bus.on('project.updated', () => count++);
    bus.removeAll('project.updated');
    bus.emit({ type: 'project.updated', projectId: 'p1', status: 'active', timestamp: 0 });

    expect(count).toBe(0);
  });
});
