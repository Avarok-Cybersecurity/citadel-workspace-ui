/**
 * MessagingLayer Protocol Types
 *
 * This module defines the highest-level protocol layer for P2P messaging.
 * MessagingLayer is serialized and sent as the contents of WorkspaceProtocol::Message,
 * which itself is inscribed within InternalServiceRequest::Message for P2P transport.
 *
 * Protocol nesting:
 * InternalServiceRequest::Message {
 *   peer_cid: target,
 *   message: WorkspaceProtocol::Message {
 *     contents: MessagingLayer (serialized)
 *   }
 * }
 */

/**
 * Discriminant enum for MessagingLayer variants
 */
export enum MessagingLayerType {
  Message = 'Message',
  Typing = 'Typing',
  Away = 'Away',
  Online = 'Online',
  Offline = 'Offline',
  CustomState = 'CustomState',
  CheckState = 'CheckState',
  CheckStateResponse = 'CheckStateResponse'
}

/**
 * Presence status types (subset of MessagingLayerType)
 */
export type PresenceStatus =
  | MessagingLayerType.Away
  | MessagingLayerType.Online
  | MessagingLayerType.Offline
  | MessagingLayerType.CustomState;

/**
 * MessagingLayer discriminated union type
 *
 * Represents all possible message types in the P2P messaging protocol:
 * - Message: Text message with contents and timestamp
 * - Typing: Indicates peer is currently typing
 * - Away: Peer is away/idle
 * - Online: Peer is online and active
 * - Offline: Peer is offline
 * - CustomState: Custom status with text and indicator color
 */
export type MessagingLayer =
  | { type: MessagingLayerType.Message; contents: string; timestamp: number }
  | { type: MessagingLayerType.Typing }
  | { type: MessagingLayerType.Away }
  | { type: MessagingLayerType.Online }
  | { type: MessagingLayerType.Offline }
  | { type: MessagingLayerType.CustomState; text: string; indicator_icon_color: string }
  | { type: MessagingLayerType.CheckState }
  | { type: MessagingLayerType.CheckStateResponse; ready: true };

/**
 * Type guard: Check if MessagingLayer is a Message variant
 */
export function isMessage(layer: MessagingLayer): layer is { type: MessagingLayerType.Message; contents: string; timestamp: number } {
  return layer.type === MessagingLayerType.Message;
}

/**
 * Type guard: Check if MessagingLayer is a Typing variant
 */
export function isTyping(layer: MessagingLayer): layer is { type: MessagingLayerType.Typing } {
  return layer.type === MessagingLayerType.Typing;
}

/**
 * Type guard: Check if MessagingLayer is an Away variant
 */
export function isAway(layer: MessagingLayer): layer is { type: MessagingLayerType.Away } {
  return layer.type === MessagingLayerType.Away;
}

/**
 * Type guard: Check if MessagingLayer is an Online variant
 */
export function isOnline(layer: MessagingLayer): layer is { type: MessagingLayerType.Online } {
  return layer.type === MessagingLayerType.Online;
}

/**
 * Type guard: Check if MessagingLayer is an Offline variant
 */
export function isOffline(layer: MessagingLayer): layer is { type: MessagingLayerType.Offline } {
  return layer.type === MessagingLayerType.Offline;
}

/**
 * Type guard: Check if MessagingLayer is a CustomState variant
 */
export function isCustomState(layer: MessagingLayer): layer is { type: MessagingLayerType.CustomState; text: string; indicator_icon_color: string } {
  return layer.type === MessagingLayerType.CustomState;
}

/**
 * Type guard: Check if MessagingLayer is a presence-related variant
 */
export function isPresenceUpdate(layer: MessagingLayer): boolean {
  return layer.type === MessagingLayerType.Away ||
         layer.type === MessagingLayerType.Online ||
         layer.type === MessagingLayerType.Offline ||
         layer.type === MessagingLayerType.CustomState;
}

/**
 * Type guard: Check if MessagingLayer is a CheckState variant
 */
export function isCheckState(layer: MessagingLayer): layer is { type: MessagingLayerType.CheckState } {
  return layer.type === MessagingLayerType.CheckState;
}

/**
 * Type guard: Check if MessagingLayer is a CheckStateResponse variant
 */
export function isCheckStateResponse(layer: MessagingLayer): layer is { type: MessagingLayerType.CheckStateResponse; ready: true } {
  return layer.type === MessagingLayerType.CheckStateResponse;
}

// ============================================================================
// Helper Constructors
// ============================================================================

/**
 * Create a Message variant
 */
export function createMessage(contents: string, timestamp?: number): MessagingLayer {
  return {
    type: MessagingLayerType.Message,
    contents,
    timestamp: timestamp ?? Date.now()
  };
}

/**
 * Create a Typing variant
 */
export function createTyping(): MessagingLayer {
  return { type: MessagingLayerType.Typing };
}

/**
 * Create an Away variant
 */
export function createAway(): MessagingLayer {
  return { type: MessagingLayerType.Away };
}

/**
 * Create an Online variant
 */
export function createOnline(): MessagingLayer {
  return { type: MessagingLayerType.Online };
}

/**
 * Create an Offline variant
 */
export function createOffline(): MessagingLayer {
  return { type: MessagingLayerType.Offline };
}

/**
 * Create a CustomState variant
 * @param text - Status text to display
 * @param indicator_icon_color - Hex color string (e.g., "#ff0000")
 */
export function createCustomState(text: string, indicator_icon_color: string): MessagingLayer {
  return {
    type: MessagingLayerType.CustomState,
    text,
    indicator_icon_color
  };
}

/**
 * Create a CheckState request - sent before messaging to verify P2P channel is active
 */
export function createCheckState(): MessagingLayer {
  return { type: MessagingLayerType.CheckState };
}

/**
 * Create a CheckStateResponse - always returns Ready
 * Even if we believe peer is ready, we respond Ready to ensure robustness
 */
export function createCheckStateResponse(): MessagingLayer {
  return { type: MessagingLayerType.CheckStateResponse, ready: true };
}

// ============================================================================
// Serialization Helpers
// ============================================================================

/**
 * Serialize a MessagingLayer to JSON string for transport
 */
export function serializeMessagingLayer(layer: MessagingLayer): string {
  return JSON.stringify(layer);
}

/**
 * Deserialize a JSON string to MessagingLayer
 * @throws Error if parsing fails or type is invalid
 */
export function deserializeMessagingLayer(json: string): MessagingLayer {
  const parsed = JSON.parse(json);

  if (!parsed || typeof parsed !== 'object' || !parsed.type) {
    throw new Error('Invalid MessagingLayer: missing type field');
  }

  // Validate the type is a known MessagingLayerType
  if (!Object.values(MessagingLayerType).includes(parsed.type)) {
    throw new Error(`Invalid MessagingLayer type: ${parsed.type}`);
  }

  // Type-specific validation
  switch (parsed.type) {
    case MessagingLayerType.Message:
      if (typeof parsed.contents !== 'string') {
        throw new Error('Invalid Message: contents must be a string');
      }
      if (typeof parsed.timestamp !== 'number') {
        throw new Error('Invalid Message: timestamp must be a number');
      }
      break;
    case MessagingLayerType.CustomState:
      if (typeof parsed.text !== 'string') {
        throw new Error('Invalid CustomState: text must be a string');
      }
      if (typeof parsed.indicator_icon_color !== 'string') {
        throw new Error('Invalid CustomState: indicator_icon_color must be a string');
      }
      break;
  }

  return parsed as MessagingLayer;
}

// ============================================================================
// Typing Indicator Constants
// ============================================================================

/** How often to poll for typing changes (ms) */
export const TYPING_POLL_INTERVAL_MS = 1000;

/** How long to display typing indicator after receiving (ms) */
export const TYPING_DISPLAY_DURATION_MS = 2000;
