/**
 * Types and helpers for useP2PMessages hook.
 */

import type { P2PMessage, PeerPresence } from '@/lib/p2p';
import { mergeById } from '@/lib/p2p/merge-by-id';

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
 * New arrivals merged into what is already rendered.
 *
 * The EXISTING copy wins a duplicate id, and the previous array reference is
 * returned when nothing new arrived — React re-renders on reference inequality,
 * and without that a thread re-sorts on every keystroke.
 *
 * The winner is passed explicitly because the messaging adapter's merge
 * resolves the same conflict the other way (in-memory beats storage), and the
 * two used to share a name and disagree silently.
 */
export function mergeMessages(existing: P2PMessage[], incoming: P2PMessage[]): P2PMessage[] {
  return mergeById(existing, incoming, 'existing');
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
