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
