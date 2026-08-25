import { debugLog } from './debug-config';

export type EventHandler<T = unknown> = (payload: T) => void;

/**
 * TypedEventEmitter - A simple typed event emitter for strongly-typed events
 * Used by managers like GroupMessagingManager that emit/subscribe to typed events
 */
export class TypedEventEmitter<T> {
  private subscribers: Set<(event: T) => void> = new Set();

  emit(event: T): void {
    this.subscribers.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        debugLog('EventEmitter', 'Error in typed event handler:', error);
      }
    });
  }

  subscribe(callback: (event: T) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  clear(): void {
    this.subscribers.clear();
  }
}

export class EventEmitter {
  // PINCH POINT: Internal storage uses any because it holds heterogeneous handler types
  // across different event names. Type safety is enforced at on<T>/emit<T> call sites.
  private listeners: Map<string, Set<EventHandler<any>>> = new Map();

  /**
   * How many handlers are currently subscribed to an event.
   *
   * Diagnostic only. A message emitted to zero listeners vanishes with no
   * error and no trace, which is indistinguishable from never having been
   * sent — and that is precisely the failure being hunted on
   * 'websocket-message' during tab boot.
   */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

   
  emit<T = unknown>(event: string, payload?: T): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(payload);
        } catch (error) {
          debugLog('EventEmitter', `Error in event handler for ${event}:`, error);
        }
      });
    }
  }

   
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const handlers = this.listeners.get(event)!;
    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

   
  once<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    const wrappedHandler: EventHandler<T> = (payload) => {
      unsubscribe();
      handler(payload);
    };
    const unsubscribe = this.on(event, wrappedHandler);
    return unsubscribe;
  }

  off(event: string, handler?: EventHandler<any>): void {
    if (!handler) {
      // Remove all handlers for this event
      this.listeners.delete(event);
    } else {
      // Remove specific handler
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.listeners.delete(event);
        }
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

// Global event emitter singleton
export const eventEmitter = new EventEmitter();