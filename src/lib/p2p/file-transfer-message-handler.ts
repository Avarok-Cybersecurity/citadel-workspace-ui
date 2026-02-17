/**
 * File Transfer Message Handler
 *
 * Handles incoming file transfer messages and creates P2P message entries.
 */

import type { P2PMessagingLayerPayload } from '@/types/p2p-types';
import { isFileTransferRequest } from '@/types/messaging-layer';
import { eventEmitter } from '../event-emitter';
import type { P2PMessage, P2PConversation } from './p2p-types';
import { debugLog } from '@/lib/debug-config';

export interface FileTransferMessageHandlerConfig {
  /** Get or create conversation */
  getOrCreateConversation: (peerCid: bigint) => P2PConversation;
  /** Notify message listeners */
  notifyMessageListeners: (message: P2PMessage) => void;
  /** Send message ack */
  sendMessageAck: (messageId: string, ackType: 'delivered' | 'read' | 'failed', peerCid: bigint) => Promise<void>;
}

export class FileTransferMessageHandler {
  private readonly config: FileTransferMessageHandlerConfig;

  constructor(config: FileTransferMessageHandlerConfig) {
    this.config = config;
  }

  /**
   * Handle file transfer message
   */
  public async handleFileTransferMessage(payload: P2PMessagingLayerPayload, peerCid: bigint): Promise<void> {
    const layer = payload.layer;

    if (!isFileTransferRequest(layer)) {
      return;
    }

    const message: P2PMessage = {
      id: payload.message_id,
      content: `File transfer: ${layer.file_name}`,
      senderCid: BigInt(payload.sender_cid),
      recipientCid: BigInt(payload.recipient_cid),
      timestamp: layer.timestamp,
      index: payload.index,
      status: 'delivered',
      message_type: 'file_transfer',
      transfer_id: layer.transfer_id,
      file_name: layer.file_name,
      file_size: layer.file_size,
      file_type: layer.file_type,
      file_thumbnail: layer.thumbnail,
      transfer_mode: layer.transfer_mode,
      transfer_state: 'pending',
      virtual_path: layer.virtual_path
    };

    const conversation = this.config.getOrCreateConversation(peerCid);
    conversation.messages.push(message);
    conversation.lastMessageIndex = Math.max(conversation.lastMessageIndex, payload.index);

    debugLog('FileTransferMessageHandler', `[P2P] Stored file transfer message in conversation with ${peerCid.toString().slice(0, 8)}...`);

    this.config.notifyMessageListeners(message);

    eventEmitter.emit('p2p:message-received', {
      peerCid,  // Keep as bigint for consistent typing (useP2PMessages hook expects bigint)
      messageId: message.id,
      text: message.content,
      timestamp: message.timestamp,
      message,
    });

    await this.config.sendMessageAck(message.id, 'delivered', peerCid);
  }
}
