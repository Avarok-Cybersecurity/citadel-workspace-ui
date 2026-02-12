// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Type erasure required for heterogeneous event storage
export type EventHandler<T = any> = (payload: T) => void;

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
        console.error('Error in typed event handler:', error);
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
  private listeners: Map<string, Set<EventHandler>> = new Map();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Heterogeneous event payloads require type erasure
  emit<T = any>(event: string, payload?: T): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Heterogeneous event payloads require type erasure
  on<T = any>(event: string, handler: EventHandler<T>): () => void {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Heterogeneous event payloads require type erasure
  once<T = any>(event: string, handler: EventHandler<T>): () => void {
    const wrappedHandler: EventHandler<T> = (payload) => {
      unsubscribe();
      handler(payload);
    };
    const unsubscribe = this.on(event, wrappedHandler);
    return unsubscribe;
  }

  off(event: string, handler?: EventHandler): void {
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