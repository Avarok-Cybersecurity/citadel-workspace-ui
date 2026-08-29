/**
 * Message Sender
 *
 * Handles sending P2P messages and commands to peers.
 * Delegates low-level operations to message-send-operations.
 */

import {
  createMessagingLayerCommand,
} from '@/types/p2p-types';
import {
  createMessage,
} from '@/types/messaging-layer';
import type { MessagingLayer } from '@/types/messaging-layer';
import { p2pRegistrationService } from '../p2p-registration-service';
import { p2pAutoConnectService } from '../p2p-auto-connect-service';
import type { P2PMessage, P2PConversation } from './p2p-types';
import { persistMessageStatus } from './message-status-persistence';
import type { MessageSenderConfig, SendMessageOptions } from './message-sender-types';
import {
  sendRawMessage as rawMessageOp,
  sendMessageAck as messageAckOp,
  sendP2PCommand as p2pCommandOp,
  sendRawBytes as rawBytesOp,
} from './message-send-operations';
import { debugLog } from '@/lib/debug-config';
import { markSendFailed } from './mark-send-failed';
import { resendMessage } from './resend-message';

export type { MessageSenderConfig, SendMessageOptions } from './message-sender-types';

export class MessageSender {
  private readonly config: MessageSenderConfig;

  constructor(config: MessageSenderConfig) {
    this.config = config;
  }

  public async sendMessage(
    recipientCid: bigint,
    content: string,
    options?: SendMessageOptions
  ): Promise<P2PMessage> {
    debugLog('MessageSender', `[P2P] *** sendMessage ENTRY *** recipientCid=${recipientCid?.toString().slice(0, 8)}..., content="${content.slice(0, 20)}..."`);

    const { replyTo, mentions, attachments, messageType = 'text', documentId, documentTitle } = options || {};

    const isAlreadyConnected = await p2pAutoConnectService.isPeerConnected(recipientCid) || this.config.isConnected(recipientCid);
    const isAlreadyRegistered = p2pRegistrationService.isPeerRegistered(recipientCid);

    if (!isAlreadyRegistered && !isAlreadyConnected) {
      debugLog('MessageSender', `Peer ${recipientCid.toString()} not registered and not connected, registering now...`);
      try {
        await p2pRegistrationService.registerPeer(recipientCid, {
          connectAfterRegister: false
        });
        debugLog('MessageSender', `Successfully registered peer ${recipientCid.toString()}`);
      } catch (error) {
        debugLog('MessageSender', `Failed to register peer ${recipientCid.toString()}:`, error);
        throw new Error(`Failed to register peer for P2P communication: ${error}`);
      }
    } else {
      debugLog('MessageSender', `Peer ${recipientCid.toString()} already ${isAlreadyConnected ? 'connected' : 'registered'}, skipping registration`);
    }

    void p2pAutoConnectService.ensurePeerConnectedInBackground(recipientCid);

    const peerReady = await this.config.tryEnsurePeerReady(recipientCid);
    if (!peerReady) {
      debugLog('MessageSender', `[P2P] Sending to ${recipientCid.toString()} without CheckState confirmation (transport handles delivery)`);
    }

    const conversation: P2PConversation = this.config.getOrCreateConversation(recipientCid);
    const index: number = conversation.lastMessageIndex + 1;

    const currentCid: bigint | null = await this.config.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }

    const timestamp: number = Date.now();
    const messageId = crypto.randomUUID();

    const layer: MessagingLayer = createMessage(content, timestamp);

    const command = createMessagingLayerCommand(
      layer,
      currentCid,
      recipientCid,
      index,
      { messageId, replyTo, mentions, attachments, messageType, documentId, documentTitle }
    );

    const message: P2PMessage = {
      id: messageId,
      content,
      senderCid: currentCid,
      recipientCid,
      timestamp,
      index,
      status: 'pending',
      replyTo,
      mentions,
      attachments,
      message_type: messageType,
      document_id: documentId,
      document_title: documentTitle
    };

    try {
      await this.config.addMessageToConversation(recipientCid, message);
    } catch (error) {
      // The in-memory push happens before the durable append, so on a storage
      // failure the message is already in the conversation — at 'pending',
      // outside the try below that would have marked it 'failed'. It surfaced
      // as a bubble stuck on "sending…" for the rest of the session, and the
      // retry affordance is gated on 'failed', so there was no way to act on it
      // short of retyping. Mark it here, then rethrow: the caller still toasts
      // and keeps the composer text.
      markSendFailed(this.config, message, messageId, error, 'Could not be saved');
      throw error;
    }
    this.config.notifyMessageListeners(message);
    // The conversation list sorts by most recent message and refreshes on this
    // event. It had a subscriber and no emitter, so sending a message never
    // moved that conversation up the list - only receiving one did.
    this.config.emitEvent('p2p:message-sent', { peerCid: recipientCid, message });
    options?.onOptimisticAppend?.();

    debugLog('MessageSender', `[P2P] Sending message ${messageId} to ${recipientCid.toString().slice(0, 8)}...`);
    const sendStartTime: number = Date.now();
    try {
      await this.sendP2PCommand(recipientCid, command);
      message.status = 'sent';
      this.config.notifyMessageStatusListeners(messageId, 'sent');
      await persistMessageStatus(this.config, recipientCid, messageId, message);
      debugLog('MessageSender', `[P2P] Message ${messageId} sent successfully in ${Date.now() - sendStartTime}ms`);
    } catch (error) {
      markSendFailed(this.config, message, messageId, error, 'Failed to send');
      // Before the rethrow. The failed status is exactly the one worth keeping:
      // it is what makes the message retryable after a reload.
      await persistMessageStatus(this.config, recipientCid, messageId, message);
      debugLog('MessageSender', `Message ${messageId} FAILED after ${Date.now() - sendStartTime}ms:`, error);
      throw error;
    }

    return message;
  }

  /** Retry a message that previously failed. See ./resend-message. */
  public async resendMessage(peerCid: bigint, messageId: string, conversation: P2PConversation): Promise<void> {
    return resendMessage(this, this.config, peerCid, messageId, conversation);
  }

  public async sendRawMessage(recipientCid: bigint, layer: MessagingLayer): Promise<void> {
    return rawMessageOp(this.config, recipientCid, layer);
  }

  public async sendMessageAck(
    messageId: string,
    ackType: 'delivered' | 'read' | 'failed',
    peerCid: bigint,
    senderCid?: bigint
  ): Promise<void> {
    return messageAckOp(this.config, messageId, ackType, peerCid, senderCid);
  }

  public async sendP2PCommand(peerCid: bigint, command: import('@/types/p2p-types').P2PCommand, senderCid?: bigint): Promise<void> {
    return p2pCommandOp(this.config, peerCid, command, senderCid);
  }

  public async sendRawBytes(peerCid: bigint, bytes: Uint8Array): Promise<void> {
    return rawBytesOp(this.config, peerCid, bytes);
  }
}
