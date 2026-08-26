/**
 * Event subscription wiring for useP2PMessages.
 *
 * Owns the fan-in from the messenger and the global event emitter into the
 * hook's conversation state: new/updated/deleted messages, status changes,
 * typing, connection, presence and registration. Split from useP2PMessages.ts
 * (beside useP2PMessages-types.ts) so the hook keeps loading, pagination and
 * actions while the nine-listener wiring lives in one place.
 */

import type { Dispatch, SetStateAction } from 'react';
import type { P2PMessengerManager } from '@/lib/p2p';
import type { P2PMessage, PeerPresence } from '@/lib/p2p';
import { p2pAutoConnectService } from '@/lib/p2p-auto-connect-service';
import { eventEmitter } from '@/lib/event-emitter';
import { debugLog } from '@/lib/debug-config';

export interface ConversationSubscriptionParams {
  messenger: P2PMessengerManager;
  peerCid: bigint;
  activeTabIdRef: React.RefObject<string>;
  onUnreadMessage: () => void;
  setMessages: Dispatch<SetStateAction<P2PMessage[]>>;
  setPeerTyping: Dispatch<SetStateAction<boolean>>;
  setIsConnected: Dispatch<SetStateAction<boolean>>;
  setPeerPresence: Dispatch<SetStateAction<PeerPresence>>;
  setIsRegistered: Dispatch<SetStateAction<boolean>>;
}

/** Wires every conversation-scoped listener; returns one combined unsubscribe. */
export function subscribeToConversationEvents({
  messenger,
  peerCid,
  activeTabIdRef,
  onUnreadMessage,
  setMessages,
  setPeerTyping,
  setIsConnected,
  setPeerPresence,
  setIsRegistered,
}: ConversationSubscriptionParams): () => void {
  const unsubscribeMessage = messenger.onMessage((message) => {
    if (message.senderCid === peerCid || message.recipientCid === peerCid) {
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message].sort((a, b) => a.timestamp - b.timestamp);
      });

      if (message.senderCid === peerCid) {
        if (activeTabIdRef.current !== 'messages') onUnreadMessage();
        if (document.visibilityState === 'visible' && activeTabIdRef.current === 'messages') {
          messenger.markMessagesAsRead(peerCid, [message.id]).catch(err => debugLog('UseP2PMessages', 'Error:', err));
        }
      }
    }
  });

  const unsubscribeStatusChange = messenger.onMessageStatusChange((messageId, status) => {
    setMessages(prev => {
      // `prev.map` always allocates, so this changed the array identity for a
      // status transition in ANY conversation — and the chat's scroll effect
      // keys on `messages`, so every sent/delivered/read anywhere in the
      // messenger threw a reader who had scrolled up back to the bottom.
      if (!prev.some(m => m.id === messageId)) return prev;
      return prev.map(m => (m.id === messageId ? { ...m, status } : m));
    });
  });

  const unsubscribeMessageUpdate = eventEmitter.on('p2p:message-updated', (updatedMessage: P2PMessage) => {
    if (updatedMessage.senderCid === peerCid || updatedMessage.recipientCid === peerCid) {
      setMessages(prev => prev.map(m => m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m));
    }
  });

  // Deletion removes the message rather than tombstoning it, matching group
  // chat. Scoped to this conversation so an unrelated peer's delete cannot
  // drop a message from the one on screen.
  const unsubscribeMessageDeleted = eventEmitter.on(
    'p2p:message-deleted',
    ({ peerCid: fromCid, messageId }: { peerCid: bigint; messageId: string }) => {
      if (fromCid !== peerCid) return;
      setMessages(prev => prev.filter(m => m.id !== messageId));
    },
  );

  // Scoped like the delete above: clearing one conversation must not empty a
  // different peer's thread that happens to be on screen.
  const unsubscribeCleared = eventEmitter.on(
    'p2p:conversation-cleared',
    ({ peerCid: clearedCid }: { peerCid: bigint }) => {
      if (clearedCid !== peerCid) return;
      setMessages([]);
    },
  );

  const unsubscribeTyping = messenger.onTyping((cid, isTyping) => {
    if (cid === peerCid) setPeerTyping(isTyping);
  });

  const unsubscribeConnection = messenger.onConnectionChange((cid, connected) => {
    if (cid === peerCid) setIsConnected(connected);
  });

  const unsubscribePresence = messenger.onPresenceChange((cid, presence) => {
    if (cid === peerCid) setPeerPresence(presence);
  });

  const unsubscribeRegistration = eventEmitter.on('p2p:peer-registered', ({ peer }: { peer: { cid: bigint } }) => {
    if (peer.cid === peerCid) {
      setIsRegistered(true);
      p2pAutoConnectService.poll();
    }
  });

  // NOTE: This handles messages from non-messenger sources (file transfers, etc.)
  // that emit 'p2p:message-received' but NOT messenger.onMessage().
  // The dedup check (prev.some(m => m.id === ...)) prevents double-processing
  // when both paths fire for the same message.
  const unsubscribeMessageReceived = eventEmitter.on('p2p:message-received', (eventData: { peerCid: bigint; messageId: string; message?: P2PMessage }) => {
    const { peerCid: messagePeerCid, messageId, message: eventMessage } = eventData;
    if (messagePeerCid === peerCid) {
      setMessages(prev => {
        if (prev.some(m => m.id === messageId)) return prev;
        const newMessage = eventMessage || (() => {
          const conversation = messenger.getConversation(peerCid);
          return conversation?.messages.find(m => m.id === messageId);
        })();
        if (newMessage) return [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
        return prev;
      });
    }
  });

  return () => {
    unsubscribeCleared();
    unsubscribeMessage();
    unsubscribeStatusChange();
    unsubscribeMessageUpdate();
    unsubscribeMessageDeleted();
    unsubscribeTyping();
    unsubscribeConnection();
    unsubscribePresence();
    unsubscribeRegistration();
    unsubscribeMessageReceived();
  };
}
