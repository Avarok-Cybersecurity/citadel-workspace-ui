/**
 * Types and helpers for useP2PMessages hook.
 */

import type { P2PMessage, PeerPresence } from '@/lib/p2p';

export interface UseP2PMessagesProps {
  peerCid: bigint;
  activeTabIdRef: React.MutableRefObject<string>;
  scrollRef: React.RefObject<HTMLDivElement>;
  onUnreadMessage: () => void;
}

export interface UseP2PMessagesReturn {
  messages: P2PMessage[];
  peerTyping: boolean;
  peerPresence: PeerPresence;
  isConnected: boolean;
  isRegistered: boolean;
  isLoadingMore: boolean;
  hasMorePages: boolean;
  handleScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  handleRetryMessage: (message: P2PMessage) => Promise<void>;
  handleEditMessage: (messageId: string, content: string) => Promise<void>;
  handleDeleteMessage: (messageId: string) => Promise<void>;
}

/**
 * Merges new messages into existing messages, deduplicating by id and sorting by timestamp.
 * Returns the previous array reference if no new messages were added (React optimization).
 */
export function mergeMessages(existing: P2PMessage[], incoming: P2PMessage[]): P2PMessage[] {
  if (existing.length === 0) return [...incoming];
  const existingIds = new Set(existing.map(m => m.id));
  const newMessages = incoming.filter(m => !existingIds.has(m.id));
  if (newMessages.length === 0) return existing;
  return [...existing, ...newMessages].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Prepends older messages to existing messages (for pagination), deduplicating by id.
 * Returns the previous array reference if no new messages were added.
 */
export function prependMessages(existing: P2PMessage[], older: P2PMessage[]): P2PMessage[] {
  const existingIds = new Set(existing.map(m => m.id));
  const newMessages = older.filter(m => !existingIds.has(m.id));
  if (newMessages.length === 0) return existing;
  return [...newMessages, ...existing].sort((a, b) => a.timestamp - b.timestamp);
}
