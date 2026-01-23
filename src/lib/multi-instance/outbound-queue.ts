/**
 * Outbound Queue
 *
 * Manages in-memory queue of messages pending ACK from the leader.
 * Provides timeout-based retry logic and max retry handling.
 *
 * Flow:
 * 1. Instance calls enqueue(payload) → returns requestId
 * 2. Message sent to leader via InstanceChannel
 * 3. Leader processes and sends ACK { status: 'processed' | 'error', error?: string }
 * 4. Instance calls acknowledge(requestId, status) → removes from queue
 *
 * Timeout/Retry:
 * - If no ACK within ACK_TIMEOUT_MS, message is retried
 * - Max MAX_RETRIES attempts
 * - After max retries, emits 'outbound-failed' event
 */

import { eventEmitter } from '../event-emitter';
import { instanceManager } from './instance-manager';

export interface QueuedMessage {
  requestId: string;
  payload: any;
  instanceId: string;
  timestamp: number;
  retryCount: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

export interface AckResult {
  status: 'processed' | 'error';
  error?: string;
  data?: any; // Optional data returned from leader (e.g., ensureMessengerOpen result)
}

class OutboundQueue {
  private static instance: OutboundQueue;

  private queue: Map<string, QueuedMessage> = new Map();

  // Configuration
  private readonly ACK_TIMEOUT_MS = 5000; // 5 seconds
  private readonly MAX_RETRIES = 3;
  private readonly CHECK_INTERVAL_MS = 1000; // Check for timeouts every second

  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): OutboundQueue {
    if (!OutboundQueue.instance) {
      OutboundQueue.instance = new OutboundQueue();
    }
    return OutboundQueue.instance;
  }

  private setupEventListeners(): void {
    // Listen for leader changes to retry pending messages
    eventEmitter.on('instance:leader-changed', (data: { isLeader: boolean; leaderId: string }) => {
      if (data.leaderId) {
        this.onLeaderChange(data.leaderId);
      }
    });
  }

  /**
   * Start the timeout checker
   * Call this when the instance is ready to send messages
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.checkInterval = setInterval(() => {
      this.checkTimeouts();
    }, this.CHECK_INTERVAL_MS);

    console.log('[OutboundQueue] Started timeout checker');
  }

  /**
   * Stop the timeout checker
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;

    console.log('[OutboundQueue] Stopped timeout checker');
  }

  /**
   * Enqueue a message for sending
   * Returns the requestId for tracking
   */
  enqueue(payload: any, requestId?: string): string {
    const id = requestId || crypto.randomUUID();

    const message: QueuedMessage = {
      requestId: id,
      payload,
      instanceId: instanceManager.instanceId,
      timestamp: Date.now(),
      retryCount: 0,
    };

    this.queue.set(id, message);

    console.log(`[OutboundQueue] Enqueued message: ${id} (queue size: ${this.queue.size})`);

    return id;
  }

  /**
   * Acknowledge a message (remove from queue)
   * Called when leader sends ACK
   */
  acknowledge(requestId: string, result: AckResult): void {
    const message = this.queue.get(requestId);

    if (!message) {
      console.log(`[OutboundQueue] ACK for unknown requestId: ${requestId}`);
      return;
    }

    // Clear timeout if set
    if (message.timeoutId) {
      clearTimeout(message.timeoutId);
    }

    this.queue.delete(requestId);

    const latency = Date.now() - message.timestamp;
    console.log(`[OutboundQueue] ACK received: ${requestId} (status: ${result.status}, latency: ${latency}ms)`);

    if (result.status === 'error') {
      console.error(`[OutboundQueue] Message failed: ${requestId}`, result.error);
      eventEmitter.emit('outbound-error', {
        requestId,
        error: result.error,
        payload: message.payload,
      });
    }
  }

  /**
   * Get a message by requestId
   */
  get(requestId: string): QueuedMessage | undefined {
    return this.queue.get(requestId);
  }

  /**
   * Remove a message from queue (without ACK)
   */
  remove(requestId: string): void {
    const message = this.queue.get(requestId);
    if (message?.timeoutId) {
      clearTimeout(message.timeoutId);
    }
    this.queue.delete(requestId);
  }

  /**
   * Get all pending messages
   */
  getPending(): QueuedMessage[] {
    return Array.from(this.queue.values());
  }

  /**
   * Get messages that have timed out
   */
  getTimedOut(): QueuedMessage[] {
    const now = Date.now();
    return Array.from(this.queue.values()).filter(
      (msg) => now - msg.timestamp > this.ACK_TIMEOUT_MS
    );
  }

  /**
   * Check for timed out messages and handle retries
   */
  private checkTimeouts(): void {
    const now = Date.now();

    for (const [requestId, message] of this.queue) {
      const elapsed = now - message.timestamp;

      if (elapsed > this.ACK_TIMEOUT_MS) {
        this.handleTimeout(requestId, message);
      }
    }
  }

  /**
   * Handle a timed out message
   */
  private handleTimeout(requestId: string, message: QueuedMessage): void {
    if (message.retryCount >= this.MAX_RETRIES) {
      // Max retries exceeded
      console.error(
        `[OutboundQueue] Max retries exceeded for ${requestId}, giving up`
      );

      this.queue.delete(requestId);

      eventEmitter.emit('outbound-failed', {
        requestId,
        error: `Max retries (${this.MAX_RETRIES}) exceeded`,
        payload: message.payload,
      });

      return;
    }

    // Retry the message
    message.retryCount++;
    message.timestamp = Date.now(); // Reset timestamp for next timeout

    console.log(
      `[OutboundQueue] Retrying ${requestId} (attempt ${message.retryCount}/${this.MAX_RETRIES})`
    );

    // Emit event to trigger re-send via InstanceChannel
    eventEmitter.emit('outbound-retry', {
      requestId,
      payload: message.payload,
      retryCount: message.retryCount,
    });
  }

  /**
   * Handle leader change - retry all pending messages to new leader
   */
  onLeaderChange(newLeaderId: string): void {
    if (this.queue.size === 0) return;

    console.log(
      `[OutboundQueue] Leader changed to ${newLeaderId}, retrying ${this.queue.size} pending messages`
    );

    for (const [requestId, message] of this.queue) {
      // Don't count leader change as a retry (reset retry count)
      // But do update timestamp to reset timeout
      message.timestamp = Date.now();

      eventEmitter.emit('outbound-retry', {
        requestId,
        payload: message.payload,
        retryCount: message.retryCount,
        reason: 'leader-change',
      });
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): { size: number; oldestMs: number | null } {
    const now = Date.now();
    let oldestMs: number | null = null;

    for (const message of this.queue.values()) {
      const age = now - message.timestamp;
      if (oldestMs === null || age > oldestMs) {
        oldestMs = age;
      }
    }

    return {
      size: this.queue.size,
      oldestMs,
    };
  }

  /**
   * Clear all pending messages
   */
  clear(): void {
    for (const message of this.queue.values()) {
      if (message.timeoutId) {
        clearTimeout(message.timeoutId);
      }
    }
    this.queue.clear();
    console.log('[OutboundQueue] Cleared all pending messages');
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stop();
    this.clear();
  }
}

// Export singleton instance
export const outboundQueue = OutboundQueue.getInstance();

// Also export class for testing
export { OutboundQueue };
