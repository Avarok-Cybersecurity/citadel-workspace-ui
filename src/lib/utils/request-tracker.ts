/**
 * Request Tracker
 *
 * Manages request/response tracking with timeout handling.
 * Provides a centralized way to track pending requests and correlate responses.
 */

import { TIMEOUT } from '../timeout-constants';

export interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  createdAt: number;
}

export interface RequestTrackerOptions {
  defaultTimeoutMs?: number;
  onTimeout?: (requestId: string) => void;
}

/**
 * Generic request tracker for correlating async requests with responses.
 * Handles timeout management and cleanup automatically.
 */
export class RequestTracker<T = unknown> {
  private readonly pendingRequests = new Map<string, PendingRequest<T>>();
  private readonly defaultTimeoutMs: number;
  private readonly onTimeout?: (requestId: string) => void;

  constructor(options: RequestTrackerOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? TIMEOUT.CLAIM_SESSION_MS;
    this.onTimeout = options.onTimeout;
  }

  /**
   * Creates a tracked request that will resolve/reject when handleResponse is called.
   * @param requestId - Unique identifier for this request
   * @param timeoutMs - Optional timeout override (defaults to constructor value)
   * @returns Promise that resolves with the response or rejects on timeout
   */
  createRequest(requestId: string, timeoutMs?: number): Promise<T> {
    const timeout = timeoutMs ?? this.defaultTimeoutMs;

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          this.onTimeout?.(requestId);
          reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
        }
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
        createdAt: Date.now()
      });
    });
  }

  /**
   * Handles a response for a tracked request.
   * @param requestId - The request ID to resolve
   * @param response - The response value
   * @returns true if request was found and resolved, false otherwise
   */
  handleResponse(requestId: string, response: T): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(requestId);
    pending.resolve(response);
    return true;
  }

  /**
   * Rejects a tracked request with an error.
   * @param requestId - The request ID to reject
   * @param error - The error to reject with
   * @returns true if request was found and rejected, false otherwise
   */
  handleError(requestId: string, error: Error): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(requestId);
    pending.reject(error);
    return true;
  }

  /**
   * Checks if a request is pending.
   */
  hasPending(requestId: string): boolean {
    return this.pendingRequests.has(requestId);
  }

  /**
   * Gets the number of pending requests.
   */
  get pendingCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Cancels a pending request without resolving or rejecting.
   */
  cancel(requestId: string): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(requestId);
    return true;
  }

  /**
   * Cancels all pending requests.
   */
  cancelAll(): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingRequests.clear();
  }

  /**
   * Cleans up expired requests that may have leaked.
   * Call periodically if requests may not always receive responses.
   * @param maxAgeMs - Maximum age in ms before request is considered leaked
   */
  cleanupStale(maxAgeMs: number): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [requestId, pending] of this.pendingRequests) {
      if (now - pending.createdAt > maxAgeMs) {
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(requestId);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Generates a unique request ID.
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
