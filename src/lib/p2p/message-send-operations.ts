/**
 * Message Send Operations
 *
 * Low-level P2P command sending and raw message operations.
 */

import type { P2PCommand, P2PAttachment } from '@/types/p2p-types';
import {
  createMessagingLayerCommand,
  createMessageAckCommand,
  serializeP2PCommand,
} from '@/types/p2p-types';
import type { MessagingLayer } from '@/types/messaging-layer';
import { websocketService } from '../websocket-service';
import { p2pAutoConnectService } from '../p2p-auto-connect-service';
import type { P2PConversation } from './p2p-types';
import type { MessageSenderConfig } from './message-sender-types';
import { debugLog } from '@/lib/debug-config';

/**
 * Send a raw MessagingLayer message to a peer (used by FileTransferService)
 */
export async function sendRawMessage(
  config: MessageSenderConfig,
  recipientCid: bigint,
  layer: MessagingLayer
): Promise<void> {
  const currentCid = await config.getCurrentCid();
  if (!currentCid) {
    throw new Error('Not connected to server');
  }

  await p2pAutoConnectService.ensurePeerConnectedInBackground(recipientCid);

  const conversation = config.getOrCreateConversation(recipientCid);
  const command = createMessagingLayerCommand(
    layer,
    currentCid,
    recipientCid,
    conversation.lastMessageIndex
  );

  await sendP2PCommand(config, recipientCid, command);
  debugLog('MessageSendOperations', `[P2P] Sent raw message type=${layer.type} to ${recipientCid.toString().slice(0, 8)}...`);
}

/**
 * Send a message acknowledgment
 */
export async function sendMessageAck(
  config: MessageSenderConfig,
  messageId: string,
  ackType: 'delivered' | 'read' | 'failed',
  peerCid: bigint,
  senderCid?: bigint
): Promise<void> {
  debugLog('MessageSendOperations', '[P2P] sendMessageAck:', {
    ack_type: ackType,
    message_id: messageId.slice(0, 8),
    to_peer: peerCid.toString().slice(0, 10),
  });
  const command = createMessageAckCommand(messageId, ackType);
  await sendP2PCommand(config, peerCid, command, senderCid);
}

/**
 * Send a P2P command to a peer
 */
export async function sendP2PCommand(
  config: MessageSenderConfig,
  peerCid: bigint,
  command: P2PCommand,
  senderCid?: bigint
): Promise<void> {
  const currentCid = senderCid || await config.getCurrentCid();
  if (!currentCid) {
    throw new Error('Not connected to server');
  }

  const messageBytes = serializeP2PCommand(command);

  debugLog('MessageSendOperations', `[P2P] *** sendP2PCommand *** from ${currentCid.toString().slice(0, 8)}... to ${peerCid.toString().slice(0, 8)}... (${messageBytes.length} bytes)`);

  await websocketService.ensureMessengerOpen(currentCid);

  debugLog('MessageSendOperations', `[P2P] *** Calling websocketService.sendP2PMessageReliable(${currentCid.toString().slice(0, 8)}..., ${peerCid.toString().slice(0, 8)}..., ...)`);
  await websocketService.sendP2PMessageReliable(currentCid, peerCid, messageBytes);
  debugLog('MessageSendOperations', `[P2P] *** websocketService.sendP2PMessageReliable completed successfully ***`);
}

/**
 * Send raw bytes to a peer (bypassing command serialization)
 */
export async function sendRawBytes(
  config: MessageSenderConfig,
  peerCid: bigint,
  bytes: Uint8Array
): Promise<void> {
  const currentCid = await config.getCurrentCid();
  if (!currentCid) {
    throw new Error('Not connected to server');
  }

  await websocketService.ensureMessengerOpen(currentCid);
  await websocketService.sendP2PMessageReliable(currentCid, peerCid, bytes);
}
