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
import { PollingService } from '../utils/polling-service';

export interface QueuedMessage {
  requestId: string;
  payload: unknown;
  instanceId: string;
  timestamp: number;
  retryCount: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * Known proxy response data shapes.
 * When adding new proxy operations that return data, add their shape here.
 */
export type ProxyResponseData =
  | { wasOpened: boolean }         // ensureMessengerOpen response
  | { success: boolean }           // generic operation result
  | Record<string, unknown>;       // fallback for other operations

export interface AckResult {
  status: 'processed' | 'error';
  error?: string;
  data?: ProxyResponseData;
}

/**
 * Type guard for ensureMessengerOpen response
 */
export function isEnsureMessengerOpenResponse(data: unknown): data is { wasOpened: boolean } {
  return (
    data !== null &&
    typeof data === 'object' &&
    'wasOpened' in data &&
    typeof (data as { wasOpened: unknown }).wasOpened === 'boolean'
  );
}

const ACK_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const CHECK_INTERVAL_MS = 1000;

class OutboundQueue extends PollingService {
  private static instance: OutboundQueue;
  private queue: Map<string, QueuedMessage> = new Map();

  private constructor() {
    super();
    this.setupEventListeners();
  }

  public static getInstance(): OutboundQueue {
    if (!OutboundQueue.instance) {
      OutboundQueue.instance = new OutboundQueue();
    }
    return OutboundQueue.instance;
  }

  protected getPollingIntervalMs(): number {
    return CHECK_INTERVAL_MS;
  }

  protected async poll(): Promise<void> {
    this.checkTimeouts();
  }

  private setupEventListeners(): void {
    eventEmitter.on('instance:leader-changed', (data: { isLeader: boolean; leaderId: string }) => {
      if (data.leaderId) {
        this.onLeaderChange(data.leaderId);
      }
    });
  }

  /**
   * Start the timeout checker
   */
  start(): void {
    this.startPolling();
    console.log('[OutboundQueue] Started timeout checker');
  }

  /**
   * Stop the timeout checker
   */
  stop(): void {
    this.stopPolling();
    console.log('[OutboundQueue] Stopped timeout checker');
  }

  /**
   * Enqueue a message for sending
   */
  enqueue(payload: unknown, requestId?: string): string {
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
   */
  acknowledge(requestId: string, result: AckResult): void {
    const message = this.queue.get(requestId);

    if (!message) {
      console.log(`[OutboundQueue] ACK for unknown requestId: ${requestId}`);
      return;
    }

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

  get(requestId: string): QueuedMessage | undefined {
    return this.queue.get(requestId);
  }

  remove(requestId: string): void {
    const message = this.queue.get(requestId);
    if (message?.timeoutId) {
      clearTimeout(message.timeoutId);
    }
    this.queue.delete(requestId);
  }

  getPending(): QueuedMessage[] {
    return Array.from(this.queue.values());
  }

  getTimedOut(): QueuedMessage[] {
    const now = Date.now();
    return Array.from(this.queue.values()).filter(
      (msg) => now - msg.timestamp > ACK_TIMEOUT_MS
    );
  }

  private checkTimeouts(): void {
    const now = Date.now();

    for (const [requestId, message] of this.queue) {
      const elapsed = now - message.timestamp;

      if (elapsed > ACK_TIMEOUT_MS) {
        this.handleTimeout(requestId, message);
      }
    }
  }

  private handleTimeout(requestId: string, message: QueuedMessage): void {
    if (message.retryCount >= MAX_RETRIES) {
      console.error(`[OutboundQueue] Max retries exceeded for ${requestId}, giving up`);

      this.queue.delete(requestId);

      eventEmitter.emit('outbound-failed', {
        requestId,
        error: `Max retries (${MAX_RETRIES}) exceeded`,
        payload: message.payload,
      });

      return;
    }

    message.retryCount++;
    message.timestamp = Date.now();

    console.log(`[OutboundQueue] Retrying ${requestId} (attempt ${message.retryCount}/${MAX_RETRIES})`);

    eventEmitter.emit('outbound-retry', {
      requestId,
      payload: message.payload,
      retryCount: message.retryCount,
    });
  }

  onLeaderChange(newLeaderId: string): void {
    if (this.queue.size === 0) return;

    console.log(`[OutboundQueue] Leader changed to ${newLeaderId}, retrying ${this.queue.size} pending messages`);

    for (const [requestId, message] of this.queue) {
      message.timestamp = Date.now();

      eventEmitter.emit('outbound-retry', {
        requestId,
        payload: message.payload,
        retryCount: message.retryCount,
        reason: 'leader-change',
      });
    }
  }

  getStats(): { size: number; oldestMs: number | null } {
    const now = Date.now();
    let oldestMs: number | null = null;

    for (const message of this.queue.values()) {
      const age = now - message.timestamp;
      if (oldestMs === null || age > oldestMs) {
        oldestMs = age;
      }
    }

    return { size: this.queue.size, oldestMs };
  }

  clear(): void {
    for (const message of this.queue.values()) {
      if (message.timeoutId) {
        clearTimeout(message.timeoutId);
      }
    }
    this.queue.clear();
    console.log('[OutboundQueue] Cleared all pending messages');
  }

  destroy(): void {
    this.stop();
    this.clear();
  }
}

export const outboundQueue = OutboundQueue.getInstance();
export { OutboundQueue };
