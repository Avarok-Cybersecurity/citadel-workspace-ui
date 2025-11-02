export type EventHandler<T = any> = (payload: T) => void;

class EventEmitter {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  emit<T = any>(event: string, payload: T): void {
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

// Create a global event emitter instance
export const globalEventEmitter = new EventEmitter();
export const eventEmitter = globalEventEmitter; // Alias for compatibility

export async function listen<T = any>(
  event: string,
  handler: (event: { payload: T }) => void
): Promise<() => void> {
  const wrappedHandler = (payload: T) => {
    handler({ payload });
  };
  
  return globalEventEmitter.on(event, wrappedHandler);
}

export async function emit<T = any>(event: string, payload: T): Promise<void> {
  globalEventEmitter.emit(event, payload);
}