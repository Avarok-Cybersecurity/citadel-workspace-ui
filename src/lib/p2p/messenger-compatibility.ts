/**
 * Messenger Compatibility Methods
 *
 * Backend sync, peer registration, file transfer state, and read tracking
 * operations extracted from P2PMessengerManager for modularity.
 */

import { websocketService } from '../websocket-service';
import { connectionManager } from '../connection';
import { p2pAutoConnectService } from '../p2p-auto-connect-service';
import { getDefaultSecuritySettings } from '../security-utils';
import { messagePaginationStore } from './message-pagination-store';
import type { ConversationManager } from './conversation-manager';
import type { P2PMessage } from './p2p-types';
import { debugLog } from '@/lib/debug-config';

type EmitFn = (event: string, data: unknown) => void;

/**
 * Sync P2P connections from backend session state.
 */
export async function syncConnectionsFromBackend(
  conversationManager: ConversationManager,
  getCurrentCid: () => Promise<bigint | null>,
  onConnect: (peerCid: bigint) => void
): Promise<void> {
  try {
    const activeSessions = await connectionManager.getActiveSessions();
    const currentCid = await getCurrentCid();
    if (!currentCid) return;
    const mySession = activeSessions.find(s => s.cid === currentCid);
    if (!mySession?.peer_connections) return;
    for (const peerCidStr of Object.keys(mySession.peer_connections)) {
      const peerCid = BigInt(peerCidStr);
      if (!conversationManager.isConnected(peerCid)) {
        conversationManager.setConnection(peerCid, true);
        onConnect(peerCid);
      }
    }
    for (const peerCid of await p2pAutoConnectService.getConnectedPeers()) {
      if (!conversationManager.isConnected(peerCid)) {
        conversationManager.setConnection(peerCid, true);
        onConnect(peerCid);
      }
    }
  } catch (error) {
    debugLog('MessengerCompatibility', 'syncConnectionsFromBackend: Failed to sync connections:', error);
  }
}

/**
 * Update file transfer state for a message in a conversation.
 */
export function updateFileTransferState(
  conversationManager: ConversationManager,
  emit: EmitFn,
  peerCid: bigint,
  transferId: string,
  updates: { transfer_state?: P2PMessage['transfer_state']; transfer_progress?: number }
): void {
  const conversation = conversationManager.getConversation(peerCid);
  if (!conversation) return;
  const message = conversation.messages.find(m => m.transfer_id === transferId);
  if (!message) return;
  if (updates.transfer_state !== undefined) message.transfer_state = updates.transfer_state;
  if (updates.transfer_progress !== undefined) message.transfer_progress = updates.transfer_progress;
  emit('p2p:message-updated', message);
}

/**
 * Mark messages as read and send acknowledgments.
 */
export async function markMessagesAsRead(
  conversationManager: ConversationManager,
  sendMessageAck: (messageId: string, ackType: 'delivered' | 'read' | 'failed', peerCid: bigint) => Promise<void>,
  emit: EmitFn,
  peerCid: bigint,
  messageIds?: string[]
): Promise<void> {
  const conversation = conversationManager.getConversation(peerCid);
  if (!conversation) return;

  const messagesToMark = messageIds
    ? conversation.messages.filter(m => messageIds.includes(m.id))
    : conversation.messages.filter(m => m.senderCid === peerCid && m.status === 'delivered');

  const markedMessageIds: string[] = [];
  for (const message of messagesToMark) {
    if (message.status === 'delivered') {
      message.status = 'read';
      markedMessageIds.push(message.id);
      await sendMessageAck(message.id, 'read', peerCid);
    }
  }

  const newUnreadCount = conversation.messages.filter(m => m.senderCid === peerCid && m.status === 'delivered').length;
  conversation.unreadCount = newUnreadCount;

  await Promise.all([
    ...markedMessageIds.map(msgId => messagePaginationStore.updateMessageInPages(peerCid, msgId, { status: 'read' })),
    messagePaginationStore.updateUnreadCount(peerCid, newUnreadCount)
  ]);

  emit('conversation-updated', { peerCid, conversation });
}

/**
 * Update unread count for a peer conversation.
 */
export async function updateUnreadCount(
  conversationManager: ConversationManager,
  peerCid: bigint,
  unreadCount: number
): Promise<void> {
  const conversation = conversationManager.getConversation(peerCid);
  if (conversation) conversation.unreadCount = unreadCount;
  await messagePaginationStore.updateUnreadCount(peerCid, unreadCount);
}

/**
 * Auto-register a peer for P2P communication.
 */
export async function autoRegisterPeer(
  getCurrentCid: () => Promise<bigint | null>,
  emit: EmitFn,
  peerCid: bigint,
  ownCid?: bigint | null
): Promise<void> {
  const cidToUse = ownCid ?? await getCurrentCid();
  if (!cidToUse) throw new Error('No CID provided for registration');
  const request = {
    PeerRegister: {
      request_id: crypto.randomUUID(), cid: cidToUse.toString(), peer_cid: peerCid.toString(),
      session_security_settings: getDefaultSecuritySettings(),
      connect_after_register: false, peer_session_password: null
    }
  };
  await websocketService.sendMessage(request);
  emit('p2p:peer-registered', {
    peer: { cid: peerCid, username: `User ${peerCid.toString().slice(0, 8)}`, fullName: `User ${peerCid.toString().slice(0, 8)}`, isOnline: true, isRegistered: true }
  });
}
