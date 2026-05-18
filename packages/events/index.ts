/**
 * Stub for @brickops/events package.
 */

export interface SystemEvent {
  type: string;
  [key: string]: unknown;
}

export type SystemEventType = string;

interface Bus {
  emit(event: Record<string, unknown>): void;
  onAny(handler: (event: any) => void): void;
  offAny(handler: (event: any) => void): void;
}

export const bus: Bus = {
  emit: (event: Record<string, unknown>) => {
    // Stub: in production this emits to internal event bus
    console.log('[bus] emit:', event.type);
  },
  onAny: (handler: (event: any) => void) => {
    // Stub
  },
  offAny: (handler: (event: any) => void) => {
    // Stub
  },
};
