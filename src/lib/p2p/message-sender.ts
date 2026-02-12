/**
 * Message Sender
 *
 * Handles sending P2P messages and commands to peers.
 */

import type { P2PCommand, P2PAttachment } from '@/types/p2p-types';
import {
  createMessagingLayerCommand,
  createMessageAckCommand,
  serializeP2PCommand,
} from '@/types/p2p-types';
import {
  createMessage,
} from '@/types/messaging-layer';
import type { MessagingLayer } from '@/types/messaging-layer';
import type { MessageType } from '@/types/message-protocol';
import { websocketService } from '../websocket-service';
import { p2pRegistrationService } from '../p2p-registration-service';
import { p2pAutoConnectService } from '../p2p-auto-connect-service';
import type { P2PMessage, P2PConversation } from './p2p-types';
import { debugLog } from '@/lib/debug-config';

export interface MessageSenderConfig {
  /** Function to get current CID */
  getCurrentCid: () => Promise<bigint | null>;
  /** Get or create conversation */
  getOrCreateConversation: (peerCid: bigint) => P2PConversation;
  /** Add message to conversation */
  addMessageToConversation: (peerCid: bigint, message: P2PMessage) => Promise<boolean>;
  /** Update message in pages */
  updateMessageInPages: (peerCid: bigint, messageId: string, updates: Partial<P2PMessage>) => Promise<boolean>;
  /** Notify message listeners */
  notifyMessageListeners: (message: P2PMessage) => void;
  /** Notify message status listeners */
  notifyMessageStatusListeners: (messageId: string, status: P2PMessage['status']) => void;
  /** Check if connected to peer */
  isConnected: (peerCid: bigint) => boolean;
  /** Try to ensure peer is ready (non-blocking) */
  tryEnsurePeerReady: (peerCid: bigint) => Promise<boolean>;
}

export class MessageSender {
  private readonly config: MessageSenderConfig;

  constructor(config: MessageSenderConfig) {
    this.config = config;
  }

  /**
   * Send a message to a peer
   */
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

    // Check if peer is registered or already connected
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
        console.error(`Failed to register peer ${recipientCid.toString()}:`, error);
        throw new Error(`Failed to register peer for P2P communication: ${error}`);
      }
    } else {
      debugLog('MessageSender', `Peer ${recipientCid.toString()} already ${isAlreadyConnected ? 'connected' : 'registered'}, skipping registration`);
    }

    // Ensure P2P connection is being established in background (non-blocking)
    void p2pAutoConnectService.ensurePeerConnectedInBackground(recipientCid);

    // Try to ensure peer is ready (non-blocking)
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

    // Add to conversation optimistically
    await this.config.addMessageToConversation(recipientCid, message);

    // Notify listeners so UI updates immediately
    this.config.notifyMessageListeners(message);

    // Send via P2P connection
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
      console.error(`[P2P] Message ${messageId} FAILED after ${Date.now() - sendStartTime}ms:`, error);
      throw error;
    }

    return message;
  }

  /**
   * Retry sending a failed message
   */
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

    // Reset status to pending
    message.status = 'pending';
    message.error = undefined;
    this.config.notifyMessageStatusListeners(messageId, 'pending');

    // Ensure P2P connection is being established in background
    await p2pAutoConnectService.ensurePeerConnectedInBackground(peerCid);

    // Try to ensure peer is ready (non-blocking)
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

    // Persist the updated status
    await this.config.updateMessageInPages(peerCid, messageId, { status: message.status, error: message.error });
  }

  /**
   * Send a raw MessagingLayer message to a peer (used by FileTransferService)
   */
  public async sendRawMessage(recipientCid: bigint, layer: MessagingLayer): Promise<void> {
    const currentCid = await this.config.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }

    await p2pAutoConnectService.ensurePeerConnectedInBackground(recipientCid);

    const conversation = this.config.getOrCreateConversation(recipientCid);
    const command = createMessagingLayerCommand(
      layer,
      currentCid,
      recipientCid,
      conversation.lastMessageIndex
    );

    await this.sendP2PCommand(recipientCid, command);
    debugLog('MessageSender', `[P2P] Sent raw message type=${layer.type} to ${recipientCid.toString().slice(0, 8)}...`);
  }

  /**
   * Send a message acknowledgment
   */
  public async sendMessageAck(
    messageId: string,
    ackType: 'delivered' | 'read' | 'failed',
    peerCid: bigint,
    senderCid?: bigint
  ): Promise<void> {
    debugLog('MessageSender', '[P2P] sendMessageAck:', {
      ack_type: ackType,
      message_id: messageId.slice(0, 8),
      to_peer: peerCid.toString().slice(0, 10),
    });
    const command = createMessageAckCommand(messageId, ackType);
    await this.sendP2PCommand(peerCid, command, senderCid);
  }

  /**
   * Send a P2P command to a peer
   */
  public async sendP2PCommand(peerCid: bigint, command: P2PCommand, senderCid?: bigint): Promise<void> {
    const currentCid = senderCid || await this.config.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }

    const messageBytes = serializeP2PCommand(command);

    debugLog('MessageSender', `[P2P] *** sendP2PCommand *** from ${currentCid.toString().slice(0, 8)}... to ${peerCid.toString().slice(0, 8)}... (${messageBytes.length} bytes)`);

    // Ensure the messenger (ILM layer) is open before sending
    await websocketService.ensureMessengerOpen(currentCid);

    // Use ILM for reliable P2P messaging
    debugLog('MessageSender', `[P2P] *** Calling websocketService.sendP2PMessageReliable(${currentCid.toString().slice(0, 8)}..., ${peerCid.toString().slice(0, 8)}..., ...)`);
    await websocketService.sendP2PMessageReliable(currentCid, peerCid, messageBytes);
    debugLog('MessageSender', `[P2P] *** websocketService.sendP2PMessageReliable completed successfully ***`);
  }

  /**
   * Send raw bytes to a peer (bypassing command serialization)
   */
  public async sendRawBytes(peerCid: bigint, bytes: Uint8Array): Promise<void> {
    const currentCid = await this.config.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }

    await websocketService.ensureMessengerOpen(currentCid);
    await websocketService.sendP2PMessageReliable(currentCid, peerCid, bytes);
  }
}
