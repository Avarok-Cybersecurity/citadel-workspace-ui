/**
 * Message Sender
 *
 * Handles sending P2P messages and commands to peers.
 * Delegates low-level operations to message-send-operations.
 */

import type { P2PAttachment } from '@/types/p2p-types';
import {
  createMessagingLayerCommand,
} from '@/types/p2p-types';
import {
  createMessage,
} from '@/types/messaging-layer';
import type { MessagingLayer } from '@/types/messaging-layer';
import type { MessageType } from '@/types/message-protocol';
import { p2pRegistrationService } from '../p2p-registration-service';
import { p2pAutoConnectService } from '../p2p-auto-connect-service';
import type { P2PMessage, P2PConversation } from './p2p-types';
import type { MessageSenderConfig } from './message-sender-types';
import {
  sendRawMessage as rawMessageOp,
  sendMessageAck as messageAckOp,
  sendP2PCommand as p2pCommandOp,
  sendRawBytes as rawBytesOp,
} from './message-send-operations';
import { debugLog } from '@/lib/debug-config';

export type { MessageSenderConfig } from './message-sender-types';

export class MessageSender {
  private readonly config: MessageSenderConfig;

  constructor(config: MessageSenderConfig) {
    this.config = config;
  }

  public async sendMessage(
    recipientCid: bigint,
    content: string,
    options?: {
      replyTo?: string;
      mentions?: string[];
      attachments?: P2PAttachment[];
      messageType?: MessageType;
      documentId?: string;
      documentTitle?: string;
    }
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

    const conversation = this.config.getOrCreateConversation(recipientCid);
    const index = conversation.lastMessageIndex + 1;

    const currentCid = await this.config.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }

    const timestamp = Date.now();
    const messageId = crypto.randomUUID();

    const layer = createMessage(content, timestamp);

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

    await this.config.addMessageToConversation(recipientCid, message);
    this.config.notifyMessageListeners(message);
    // The conversation list sorts by most recent message and refreshes on this
    // event. It had a subscriber and no emitter, so sending a message never
    // moved that conversation up the list - only receiving one did.
    this.config.emitEvent('p2p:message-sent', { peerCid: recipientCid, message });

    debugLog('MessageSender', `[P2P] Sending message ${messageId} to ${recipientCid.toString().slice(0, 8)}...`);
    const sendStartTime = Date.now();
    try {
      await this.sendP2PCommand(recipientCid, command);
      message.status = 'sent';
      this.config.notifyMessageStatusListeners(messageId, 'sent');
      debugLog('MessageSender', `[P2P] Message ${messageId} sent successfully in ${Date.now() - sendStartTime}ms`);
    } catch (error) {
      message.status = 'failed';
      message.error = error instanceof Error ? error.message : 'Failed to send';
      this.config.notifyMessageStatusListeners(messageId, 'failed');
      debugLog('MessageSender', `Message ${messageId} FAILED after ${Date.now() - sendStartTime}ms:`, error);
      throw error;
    }

    return message;
  }

  public async resendMessage(peerCid: bigint, messageId: string, conversation: P2PConversation): Promise<void> {
    const message = conversation.messages.find(m => m.id === messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found in conversation`);
    }

    if (message.status !== 'failed') {
      debugLog('MessageSender', `[P2P] Message ${messageId} is not in failed state (${message.status}), skipping resend`);
      return;
    }

    debugLog('MessageSender', `[P2P] Resending message ${messageId} to ${peerCid}`);

    message.status = 'pending';
    message.error = undefined;
    this.config.notifyMessageStatusListeners(messageId, 'pending');

    await p2pAutoConnectService.ensurePeerConnectedInBackground(peerCid);

    const peerReady = await this.config.tryEnsurePeerReady(peerCid);
    if (!peerReady) {
      debugLog('MessageSender', `[P2P] Resending to ${peerCid} without CheckState confirmation`);
    }

    const currentCid = await this.config.getCurrentCid();
    if (!currentCid) {
      message.status = 'failed';
      message.error = 'Not connected to server';
      this.config.notifyMessageStatusListeners(messageId, 'failed');
      throw new Error('Not connected to server');
    }

    const layer = createMessage(message.content, message.timestamp);
    const command = createMessagingLayerCommand(
      layer,
      currentCid,
      peerCid,
      message.index,
      {
        messageId: message.id,
        replyTo: message.replyTo,
        mentions: message.mentions,
        attachments: message.attachments as P2PAttachment[] | undefined,
        messageType: message.message_type,
        documentId: message.document_id,
        documentTitle: message.document_title
      }
    );

    try {
      await this.sendP2PCommand(peerCid, command);
      message.status = 'sent';
      this.config.notifyMessageStatusListeners(messageId, 'sent');
      debugLog('MessageSender', `[P2P] Successfully resent message ${messageId}`);
    } catch (error) {
      message.status = 'failed';
      message.error = error instanceof Error ? error.message : 'Failed to send';
      this.config.notifyMessageStatusListeners(messageId, 'failed');
      throw error;
    }

    await this.config.updateMessageInPages(peerCid, messageId, { status: message.status, error: message.error });
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
