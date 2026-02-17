/**
 * P2P Messaging Adapter - Lifecycle Management
 *
 * Handles initialization (event subscription) and cleanup for the adapter.
 */

import type { P2PMessagingAdapter } from './adapter';
import { convertP2PMessageToChatMessage, mapP2PStatus } from './converters';

/**
 * Initialize the adapter: sync connections and subscribe to P2P events.
 * Sets up listeners for messages, status changes, typing, presence, and connection.
 */
export async function initializeAdapter(adapter: P2PMessagingAdapter): Promise<void> {
  await adapter.manager.waitForReady();
  await adapter.manager.syncConnectionsFromBackend();

  const unsubMessage = adapter.manager.onMessage((msg) => {
    if (msg.senderCid !== adapter.peerCid && msg.recipientCid !== adapter.peerCid) {
      return;
    }

    const chatMessage = convertP2PMessageToChatMessage(
      msg,
      adapter.currentUserIdBigInt,
      adapter.peerName
    );

    if (!adapter.messages.find((m) => m.id === chatMessage.id)) {
      adapter.messages.push(chatMessage);
      adapter.messages.sort((a, b) => a.timestamp - b.timestamp);
    }

    adapter.notifySubscribers({
      type: msg.senderCid === adapter.currentUserIdBigInt ? 'message_sent' : 'message_received',
      message: chatMessage,
    });
  });
  adapter.unsubscribers.push(unsubMessage);

  const unsubStatus = adapter.manager.onMessageStatusChange((messageId, status) => {
    const message = adapter.messages.find((m) => m.id === messageId);
    if (message) {
      message.status = mapP2PStatus(status);
      adapter.notifySubscribers({
        type: 'message_updated',
        message,
      });
    }
  });
  adapter.unsubscribers.push(unsubStatus);

  const unsubTyping = adapter.manager.onTyping((peerCid, isTyping) => {
    if (peerCid === adapter.peerCid) {
      adapter.notifySubscribers({
        type: isTyping ? 'typing_started' : 'typing_stopped',
        senderId: peerCid.toString(),
        isTyping,
      });
    }
  });
  adapter.unsubscribers.push(unsubTyping);

  const unsubPresence = adapter.manager.onPresenceChange((peerCid, presence) => {
    if (peerCid === adapter.peerCid) {
      const isOnline = presence.status !== 'Offline';
      adapter.notifySubscribers({
        type: 'presence_changed',
        senderId: peerCid.toString(),
        presence: isOnline ? 'online' : 'offline',
      });
    }
  });
  adapter.unsubscribers.push(unsubPresence);

  const unsubConnection = adapter.manager.onConnectionChange((peerCid, connected) => {
    if (peerCid === adapter.peerCid) {
      adapter.notifySubscribers({
        type: 'connection_changed',
        isConnected: connected,
      });
    }
  });
  adapter.unsubscribers.push(unsubConnection);

  adapter.manager.setActiveConversation(adapter.peerCid);
}

/**
 * Clean up the adapter: unsubscribe from all events and clear state.
 */
export function cleanupAdapter(adapter: P2PMessagingAdapter): void {
  adapter.unsubscribers.forEach((unsub) => unsub());
  adapter.unsubscribers = [];
  adapter.subscribers = [];

  adapter.manager.setActiveConversation(null);
  adapter.manager.stopTypingPolling(adapter.peerCid);
}
