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

/** A handler with its payload type erased for storage; see the pinch point below. */
type StoredHandler = (payload?: unknown) => void;

export class EventEmitter {
  // PINCH POINT: one map holds handlers for many different event payloads, so
  // the STORED type has to erase the payload. `StoredHandler` says that in one
  // place with one cast at each boundary, instead of `any`, which erases it
  // everywhere and lets a caller read a property off it by accident. Type
  // safety is enforced at the typed on<T>/emit<T> call sites.
  private listeners: Map<string, Set<StoredHandler>> = new Map();

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
    // The one cast, at the boundary: `on<T>` knows the payload type and the map
    // cannot. Everything below this line treats it as erased.
    const stored = handler as StoredHandler;
    handlers.add(stored);

    // Return unsubscribe function
    return () => {
      handlers.delete(stored);
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

  // Generic like `on`, so a caller can pass back the same typed handler it
  // registered. Non-generic (`EventHandler<unknown>`) it refused every handler
  // that names its payload, which is all of them.
  off<T = unknown>(event: string, handler?: EventHandler<T>): void {
    if (!handler) {
      // Remove all handlers for this event
      this.listeners.delete(event);
    } else {
      // Remove specific handler
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.delete(handler as StoredHandler);
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