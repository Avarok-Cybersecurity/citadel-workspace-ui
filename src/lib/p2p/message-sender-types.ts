/**
 * Message Sender Types
 *
 * Configuration interface for the MessageSender.
 */

import type { P2PMessage, P2PConversation } from './p2p-types';

export interface MessageSenderConfig {
  /** Function to get current CID */
  getCurrentCid: () => Promise<bigint | null>;
  /** Get or create conversation */
  getOrCreateConversation: (peerCid: bigint) => P2PConversation;
  /** Add message to conversation */
  addMessageToConversation: (peerCid: bigint, message: P2PMessage) => Promise<boolean>;
  /**
   * Read a stored message back. The in-memory window is empty after a reload,
   * so a retry that consults only memory can never find its own message.
   */
  findStoredMessage: (peerCid: bigint, messageId: string) => Promise<P2PMessage | null>;
  /** Update message in pages */
  updateMessageInPages: (peerCid: bigint, messageId: string, updates: Partial<P2PMessage>) => Promise<boolean>;
  /** Emit an app-level event (injected so the sender stays free of the emitter). */
  emitEvent: (event: string, data?: unknown) => void;
  /** Notify message listeners */
  notifyMessageListeners: (message: P2PMessage) => void;
  /** Notify message status listeners */
  notifyMessageStatusListeners: (messageId: string, status: P2PMessage['status']) => void;
  /** Check if connected to peer */
  isConnected: (peerCid: bigint) => boolean;
  /** Try to ensure peer is ready (non-blocking) */
  tryEnsurePeerReady: (peerCid: bigint) => Promise<boolean>;
}
