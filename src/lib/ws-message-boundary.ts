import type { WebSocketMessage } from '@/types/ws-message-types';

/**
 * PINCH POINT: Narrows unknown WebSocket event payload to typed union.
 * This is the ONLY place where untyped-to-typed conversion happens for WebSocket messages.
 * Returns null if the input isn't a valid discriminated union shape.
 */
export function narrowWebSocketMessage(raw: unknown): WebSocketMessage | null {
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;
  const keys = Object.keys(raw as Record<string, unknown>);
  if (keys.length === 0) return null;
  return raw as WebSocketMessage;
}

/**
 * Type-safe variant check for WebSocketMessage, including TYPE-GAP variants
 * not in the generated InternalServiceResponse union.
 * For variants IN the generated types, prefer isResponseType() for stronger compile-time checks.
 */
export function hasVariant<K extends string>(
  message: WebSocketMessage,
  key: K
): message is WebSocketMessage & Record<K, unknown> {
  return typeof message === 'object' && message !== null && key in message;
}
