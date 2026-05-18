import { EventEmitter } from 'events';
import type { SystemEvent, SystemEventType, EventOfType } from './types';

/**
 * Typed event bus.
 *
 * Wraps Node's EventEmitter with type-safe emit/subscribe methods.
 * All BrickOps services share this bus for inter-service communication.
 *
 * Currently in-process; can be swapped for Redis pub/sub later by
 * replacing the emit/on implementation without changing the interface.
 */
export class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Allow many listeners for a busy system
    this.emitter.setMaxListeners(100);
  }

  /**
   * Publish a typed event.
   */
  emit(event: SystemEvent): void {
    this.emitter.emit(event.type, event);
    // Also emit on wildcard for logging/debugging
    this.emitter.emit('*', event);
  }

  /**
   * Subscribe to a specific event type with full type inference.
   */
  on<T extends SystemEventType>(
    type: T,
    handler: (event: EventOfType<T>) => void
  ): void {
    this.emitter.on(type, handler as any);
  }

  /**
   * Subscribe to a specific event type, firing only once.
   */
  once<T extends SystemEventType>(
    type: T,
    handler: (event: EventOfType<T>) => void
  ): void {
    this.emitter.once(type, handler as any);
  }

  /**
   * Subscribe to ALL events (for logging, telemetry, etc).
   */
  onAny(handler: (event: SystemEvent) => void): void {
    this.emitter.on('*', handler);
  }

  /**
   * Remove a wildcard listener (added via onAny).
   */
  offAny(handler: (event: SystemEvent) => void): void {
    this.emitter.off('*', handler);
  }

  /**
   * Remove a specific listener.
   */
  off<T extends SystemEventType>(
    type: T,
    handler: (event: EventOfType<T>) => void
  ): void {
    this.emitter.off(type, handler as any);
  }

  /**
   * Remove all listeners for a specific event type.
   */
  removeAll(type?: SystemEventType): void {
    if (type) {
      this.emitter.removeAllListeners(type);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}

/** Shared singleton bus for the whole process. */
export const bus = new EventBus();
