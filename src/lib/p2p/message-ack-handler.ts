/**
 * Message Ack Handler
 *
 * Handles message acknowledgment processing (delivered, read, failed).
 */

import type { P2PMessageAckPayload } from '@/types/p2p-types';
import type { P2PMessage, P2PConversation } from './p2p-types';
import { debugLog } from '@/lib/debug-config';

export interface MessageAckHandlerConfig {
  /** Get conversations map */
  getConversations: () => Map<bigint, P2PConversation>;
  /** Update message status in pages */
  updateMessageInPages: (peerCid: bigint, messageId: string, updates: Partial<P2PMessage>) => Promise<boolean>;
  /** Notify message status listeners */
  notifyMessageStatusListeners: (messageId: string, status: P2PMessage['status']) => void;
}

export class MessageAckHandler {
  private readonly config: MessageAckHandlerConfig;

  constructor(config: MessageAckHandlerConfig) {
    this.config = config;
  }

  /**
   * Handle message acknowledgment
   */
  public async handleMessageAck(payload: P2PMessageAckPayload): Promise<void> {
    debugLog('MessageAckHandler', '[P2P] handleMessageAck received:', {
      ack_type: payload.ack_type,
      message_id: payload.message_id.slice(0, 8),
    });

    let statusUpdated = false;
    let newStatus: P2PMessage['status'] = 'sent';
    const updatedMessages: Array<{ peerCid: bigint; messageId: string; status: P2PMessage['status']; error?: string }> = [];

    const conversations = this.config.getConversations();

    conversations.forEach((conversation, peerCid) => {
      const message = conversation.messages.find(m => m.id === payload.message_id);
      if (message) {
        debugLog('MessageAckHandler', '[P2P] handleMessageAck FOUND message, updating status:', message.status, '->', payload.ack_type);
        newStatus = payload.ack_type === 'failed' ? 'failed' : payload.ack_type;
        message.status = newStatus;
        if (payload.error) {
          message.error = payload.error;
        }
        statusUpdated = true;
        updatedMessages.push({ peerCid, messageId: message.id, status: newStatus, error: payload.error });

        // Mark earlier messages from same sender to same status
        if (newStatus === 'read' || newStatus === 'delivered') {
          this.propagateStatusToEarlierMessages(conversation, message, newStatus, peerCid, updatedMessages);
        }
      }
    });

    // Persist status updates
    await Promise.all(
      updatedMessages.map(({ peerCid, messageId, status, error }) =>
        this.config.updateMessageInPages(peerCid, messageId, { status, error })
      )
    );

    if (statusUpdated) {
      debugLog('MessageAckHandler', '[P2P] handleMessageAck notifying listeners for', updatedMessages.length, 'messages');
      updatedMessages.forEach(({ messageId }) => {
        this.config.notifyMessageStatusListeners(messageId, newStatus);
      });
    } else {
      debugLog('MessageAckHandler', 'handleMessageAck: Message NOT FOUND in any conversation!', payload.message_id.slice(0, 8));
    }
  }

  /**
   * Propagate read/delivered status to earlier messages from the same sender
   */
  private propagateStatusToEarlierMessages(
    conversation: P2PConversation,
    ackedMessage: P2PMessage,
    newStatus: P2PMessage['status'],
    peerCid: bigint,
    updatedMessages: Array<{ peerCid: bigint; messageId: string; status: P2PMessage['status']; error?: string }>
  ): void {
    const ackedMessageTimestamp = ackedMessage.timestamp;
    const ackedMessageSender = ackedMessage.senderCid;

    conversation.messages.forEach(earlierMsg => {
      if (
        earlierMsg.senderCid === ackedMessageSender &&
        earlierMsg.timestamp < ackedMessageTimestamp &&
        earlierMsg.id !== ackedMessage.id &&
        (earlierMsg.status === 'sent' || earlierMsg.status === 'delivered')
      ) {
        // Only upgrade status (sent -> delivered -> read), never downgrade
        if (newStatus === 'read' || earlierMsg.status === 'sent') {
          earlierMsg.status = newStatus;
          updatedMessages.push({ peerCid, messageId: earlierMsg.id, status: newStatus });
        }
      }
    });
  }
}
