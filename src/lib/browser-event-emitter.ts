/**
 * Browser-compatible EventEmitter implementation
 * 
 * This is a simple implementation of the EventEmitter pattern that works in browsers
 * without requiring the Node.js 'events' module.
 */

export class BrowserEventEmitter {
  private events: Record<string, Array<(data: any) => void>> = {};

  /**
   * Register an event listener
   */
  on(event: string, listener: (data: any) => void): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  /**
   * Remove an event listener
   */
  removeListener(event: string, listener: (data: any) => void): void {
    if (!this.events[event]) return;
    
    const idx = this.events[event].indexOf(listener);
    if (idx !== -1) {
      this.events[event].splice(idx, 1);
    }
  }

  /**
   * Emit an event with data
   */
  emit(event: string, data?: any): boolean {
    if (!this.events[event]) return false;
    
    this.events[event].forEach(listener => {
      try {
        listener(data);
      } catch (e) {
        console.error(`Error in event listener for ${event}:`, e);
      }
    });
    
    return true;
  }

  /**
   * Register a one-time event listener
   */
  once(event: string, listener: (data: any) => void): void {
    const onceWrapper = (data: any) => {
      listener(data);
      this.removeListener(event, onceWrapper);
    };
    this.on(event, onceWrapper);
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(event?: string): void {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }

  /**
   * Get all listeners for an event
   */
  listeners(event: string): Array<(data: any) => void> {
    return this.events[event] || [];
  }
}
