/**
 * Request-Response Pattern
 *
 * Generic utility for the repeated pattern of:
 * 1. Send a request via WebSocket
 * 2. Listen for a success/failure response matched by request_id
 * 3. Clean up timeout + listener on resolution
 *
 * Eliminates ~500 lines of duplicated boilerplate across
 * local-db-operations, p2p-operations, disconnect-operations,
 * and session-management.
 */

import { eventEmitter } from '../event-emitter';

export interface ResponseMatcher<T> {
  /** Return extracted data on success match, undefined to skip */
  matchSuccess: (message: Record<string, unknown>) => T | undefined;
  /** Return error message on failure match, undefined to skip */
  matchFailure: (message: Record<string, unknown>) => string | undefined;
}

export interface RequestResponseOptions<T> {
  request: unknown;
  requestId: string;
  sendRequest: (request: unknown, requestId?: string) => Promise<void>;
  timeoutMs: number;
  operationName: string;
  matcher: ResponseMatcher<T>;
}

export function requestResponse<T>(options: RequestResponseOptions<T>): Promise<T> {
  const { request, requestId, sendRequest, timeoutMs, operationName, matcher } = options;

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      eventEmitter.off('websocket-message', handler);
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`${operationName} request timed out`));
    }, timeoutMs);

    const handler = (message: Record<string, unknown>) => {
      const successData = matcher.matchSuccess(message);
      if (successData !== undefined) {
        cleanup();
        resolve(successData);
        return;
      }

      const failureMsg = matcher.matchFailure(message);
      if (failureMsg !== undefined) {
        cleanup();
        reject(new Error(failureMsg));
      }
    };

    eventEmitter.on('websocket-message', handler);

    sendRequest(request, requestId).catch(error => {
      cleanup();
      reject(error);
    });
  });
}

/**
 * Variant that resolves void on success/failure (warn-and-continue pattern).
 * Used by operations like acceptPeerConnect that should not reject on failure.
 */
export function requestResponseSoft(options: {
  request: unknown;
  requestId: string;
  sendRequest: (request: unknown, requestId?: string) => Promise<void>;
  timeoutMs: number;
  operationName: string;
  matchSuccess: (message: Record<string, unknown>) => boolean;
  matchFailure: (message: Record<string, unknown>) => string | undefined;
  onTimeout?: () => void;
  onFailure?: (error: string) => void;
}): Promise<void> {
  const { request, requestId, sendRequest, timeoutMs, operationName,
    matchSuccess, matchFailure, onTimeout, onFailure } = options;

  return new Promise<void>((resolve) => {
    const cleanup = () => {
      clearTimeout(timeout);
      eventEmitter.off('websocket-message', handler);
    };

    const timeout = setTimeout(() => {
      cleanup();
      if (onTimeout) onTimeout();
      resolve();
    }, timeoutMs);

    const handler = (message: Record<string, unknown>) => {
      if (matchSuccess(message)) {
        cleanup();
        resolve();
        return;
      }

      const failureMsg = matchFailure(message);
      if (failureMsg !== undefined) {
        cleanup();
        if (onFailure) onFailure(failureMsg);
        resolve();
      }
    };

    eventEmitter.on('websocket-message', handler);

    sendRequest(request, requestId).catch(error => {
      cleanup();
      console.warn(`Failed to send ${operationName}:`, error);
      resolve();
    });
  });
}
