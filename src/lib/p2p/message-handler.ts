/**
 * Message Handler
 *
 * Handles incoming P2P messages from WebSocket and routes them appropriately.
 */

import type {
  P2PCommand,
  P2PMessagingLayerPayload,
} from '@/types/p2p-types';
import {
  P2PCommandType,
  deserializeP2PCommand,
  isMessagingLayerPayload,
  isMessageAckPayload,
} from '@/types/p2p-types';
import {
  MessagingLayerType,
  isMessage,
  isRevfsOperation,
  TYPING_DISPLAY_DURATION_MS,
} from '@/types/messaging-layer';
import { eventEmitter } from '../event-emitter';
import { BroadcastChannelService } from '../broadcast-channel-service';
import { p2pRegistrationService } from '../p2p-registration-service';
import { p2pAutoConnectService } from '../p2p-auto-connect-service';
import { ensureBigIntOrNull } from '../utils';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';
import type { P2PMessage, P2PConversation, PeerPresence } from './p2p-types';

// ============================================================================
// Type guards for InternalServiceResponse variants
// These provide type-safe access to response payloads without dirty casts
// ============================================================================

interface PeerMessagePayload {
  peer_cid: bigint | string | number;
  message: Uint8Array | number[];
}

interface MessageNotificationPayload {
  cid: bigint | string | number;
  peer_cid: bigint | string | number;
  message: Uint8Array | number[];
}

function isPeerMessage(
  response: InternalServiceResponse
): response is InternalServiceResponse & { PeerMessage: PeerMessagePayload } {
  return 'PeerMessage' in response && response.PeerMessage !== null && typeof response.PeerMessage === 'object';
}

function isMessageNotification(
  response: InternalServiceResponse
): response is InternalServiceResponse & { MessageNotification: MessageNotificationPayload } {
  return 'MessageNotification' in response && response.MessageNotification !== null && typeof response.MessageNotification === 'object';
}
import { MessageAckHandler } from './message-ack-handler';
import { FileTransferMessageHandler } from './file-transfer-message-handler';
import { revfsService } from '@/lib/revfs';
import { debugLog } from '@/lib/debug-config';

export interface MessageHandlerConfig {
  getCurrentCid: () => Promise<bigint | null>;
  isConnected: (peerCid: bigint) => boolean;
  getOrCreateConversation: (peerCid: bigint) => P2PConversation;
  addMessageToConversation: (peerCid: bigint, message: P2PMessage) => Promise<boolean>;
  updateMessageInPages: (peerCid: bigint, messageId: string, updates: Partial<P2PMessage>) => Promise<boolean>;
  getConversations: () => Map<bigint, P2PConversation>;
  notifyMessageListeners: (message: P2PMessage) => void;
  notifyMessageStatusListeners: (messageId: string, status: P2PMessage['status']) => void;
  notifyTypingListeners: (peerCid: bigint, isTyping: boolean) => void;
  notifyPresenceListeners: (peerCid: bigint, presence: PeerPresence) => void;
  sendMessageAck: (messageId: string, ackType: 'delivered' | 'read' | 'failed', peerCid: bigint, recipientCid?: bigint) => Promise<void>;
  handleCheckState: (peerCid: bigint) => Promise<void>;
  handleCheckStateResponse: (peerCid: bigint) => void;
  markPeerReady: (peerCid: bigint) => void;
  shouldShowNotification: (peerCid: bigint) => boolean;
  addNotification: (
    title: string,
    body: string,
    senderId: string,
    messageId: string,
    recipientCid: string | undefined,
    options: { peerCid: string; onOpen: () => void }
  ) => void;
}

export class MessageHandler {
  private readonly config: MessageHandlerConfig;
  private readonly ackHandler: MessageAckHandler;
  private readonly fileTransferHandler: FileTransferMessageHandler;

  constructor(config: MessageHandlerConfig) {
    this.config = config;
    this.ackHandler = new MessageAckHandler({
      getConversations: config.getConversations,
      updateMessageInPages: config.updateMessageInPages,
      notifyMessageStatusListeners: config.notifyMessageStatusListeners,
    });
    this.fileTransferHandler = new FileTransferMessageHandler({
      getOrCreateConversation: config.getOrCreateConversation,
      notifyMessageListeners: config.notifyMessageListeners,
      sendMessageAck: config.sendMessageAck,
    });
  }

  /**
   * Handle WebSocket message response
   */
  public async handleWebSocketMessage(response: InternalServiceResponse): Promise<void> {
    // Handle P2P message responses via MessageNotification
    if (isMessageNotification(response)) {
      await this.handleMessageNotification(response);
      return;
    }

    // Handler for PeerMessage format
    if (isPeerMessage(response)) {
      const { peer_cid, message } = response.PeerMessage;
      try {
        let messageBytes: Uint8Array;
        if (Array.isArray(message)) {
          messageBytes = new Uint8Array(message);
        } else if (message instanceof Uint8Array) {
          messageBytes = message;
        } else {
          console.error('Unexpected PeerMessage format (expected array or Uint8Array):', typeof message);
          return;
        }
        const command = deserializeP2PCommand(messageBytes);
        const peerCidBigint = ensureBigIntOrNull(peer_cid);
        if (peerCidBigint !== null) {
          await this.handleP2PCommand(command, peerCidBigint);
        }
      } catch (error) {
        console.error('Failed to deserialize P2P command:', error);
      }
    }
  }

  /**
   * Handle MessageNotification response
   * Pre-condition: isMessageNotification(response) has passed
   */
  private async handleMessageNotification(
    response: InternalServiceResponse & { MessageNotification: MessageNotificationPayload }
  ): Promise<void> {
    const notification = response.MessageNotification;
    const { message: rawMessage, peer_cid, cid } = notification;

    const currentCid = await this.config.getCurrentCid();
    const peerCidBigint = ensureBigIntOrNull(peer_cid) ?? undefined;
    const notificationCidBigint = ensureBigIntOrNull(cid) ?? undefined;

    // CRITICAL FIX: If currentCid is null but we received a valid notification CID,
    // use notificationCidBigint as the effective CID. This handles the race condition
    // where messages arrive before instanceManager.setCid() is called after ClaimSession.
    // The notification CID comes from the server and is authoritative.
    const effectiveCid = currentCid ?? notificationCidBigint;

    if (!currentCid && notificationCidBigint) {
      debugLog('MessageHandler', '[P2P] WARNING: currentCid is null, using notification CID as fallback:', notificationCidBigint?.toString());
    }

    debugLog('MessageHandler', '[P2P] handleWebSocketMessage checking MessageNotification:', {
      peer_cid: peerCidBigint?.toString(),
      notification_cid: notificationCidBigint?.toString(),
      currentCid: currentCid?.toString(),
      effectiveCid: effectiveCid?.toString(),
      isP2P: peerCidBigint !== undefined && peerCidBigint !== 0n,
    });

    // Skip if no peer_cid or peer_cid is 0 (from server)
    if (peerCidBigint === undefined || peerCidBigint === 0n) {
      debugLog('MessageHandler', '[P2P] Skipping: no peer_cid or peer_cid is 0');
      return;
    }

    // Self-message check
    if (peerCidBigint === notificationCidBigint) {
      debugLog('MessageHandler', '[P2P] Skipping: peer_cid equals notification_cid (self-message)');
      return;
    }

    try {
      let contentBytes: Uint8Array;
      if (Array.isArray(rawMessage)) {
        contentBytes = new Uint8Array(rawMessage);
      } else if (rawMessage instanceof Uint8Array) {
        contentBytes = rawMessage;
      } else {
        console.error('Unexpected message format (expected array or Uint8Array):', typeof rawMessage);
        return;
      }

      debugLog('MessageHandler', 'P2P message received:', contentBytes.length, 'bytes');

      // Broadcast raw message for Yjs sync BEFORE session check
      const rawMessageData = { peerCid: peerCidBigint, message: contentBytes };
      eventEmitter.emit('p2p:raw-message', { peerCid: peerCidBigint.toString(), message: contentBytes });
      BroadcastChannelService.getInstance().broadcastP2PRawMessage(rawMessageData);

      // Multi-tab session routing (using effectiveCid to handle ClaimSession race condition)
      const isOwnOutgoingEcho = peerCidBigint === effectiveCid;
      if (isOwnOutgoingEcho && notificationCidBigint !== effectiveCid) {
        debugLog('MessageHandler', '[P2P] Outgoing echo for different session, broadcasting to follower tabs');
        BroadcastChannelService.getInstance().broadcastP2PNotification({
          notification,
          messageBytes: contentBytes
        });
        return;
      }

      const isForDifferentSession = notificationCidBigint !== undefined && notificationCidBigint !== effectiveCid;
      if (isForDifferentSession) {
        debugLog('MessageHandler', '[P2P] Message for different session, broadcasting to follower tabs');
        BroadcastChannelService.getInstance().broadcastP2PNotification({
          notification,
          messageBytes: contentBytes
        });
        return;
      }

      debugLog('MessageHandler', 'P2P MessageNotification received from peer:', peerCidBigint.toString());

      // Verify sender is registered
      const isAlreadyConnected = this.config.isConnected(peerCidBigint);
      const isAlreadyRegistered = p2pRegistrationService.isPeerRegistered(peerCidBigint);

      if (!isAlreadyRegistered && !isAlreadyConnected) {
        console.error(`[P2P] Received message from unregistered peer ${peerCidBigint.toString()} - protocol violation`);
      }

      const command = deserializeP2PCommand(contentBytes);
      await this.handleP2PCommand(command, peerCidBigint, notificationCidBigint);
    } catch (error) {
      console.error('Failed to deserialize P2P command:', error);
    }
  }

  /**
   * Handle a P2P command
   */
  public async handleP2PCommand(command: P2PCommand, peerCid: bigint, recipientCid?: bigint): Promise<void> {
    debugLog('MessageHandler', '[P2P] handleP2PCommand received:', {
      type: command.type,
      typeValue: P2PCommandType[command.type] || command.type,
      peerCid: peerCid?.toString().slice(0, 12),
      hasPayload: !!command.payload,
    });

    switch (command.type) {
      case P2PCommandType.MessagingLayerCommand:
        if (isMessagingLayerPayload(command.payload)) {
          await this.handleMessagingLayerCommand(command.payload, peerCid, recipientCid);
        } else {
          console.warn('[P2P] handleP2PCommand: MessagingLayerCommand payload failed type check');
        }
        break;

      case P2PCommandType.MessageAck:
        debugLog('MessageHandler', '[P2P] handleP2PCommand: MessageAck branch reached');
        if (isMessageAckPayload(command.payload)) {
          await this.handleMessageAck(command.payload);
        } else {
          console.warn('[P2P] handleP2PCommand: MessageAck payload failed type check', command.payload);
        }
        break;

      default:
        console.warn('[P2P] handleP2PCommand: Unknown command type:', command.type);
    }
  }

  /**
   * Handle MessagingLayer command
   */
  private async handleMessagingLayerCommand(payload: P2PMessagingLayerPayload, peerCid: bigint, recipientCid?: bigint): Promise<void> {
    const { layer } = payload;

    // Any P2P message received means the peer is online and ready
    this.config.markPeerReady(peerCid);

    // CRITICAL: Mark channel as "ready" for p2pAutoConnectService.
    // This proves bidirectional message flow works (we received a message).
    // Tests can wait for the 'p2p:channel-ready' event to know when
    // messaging is truly operational, not just "connected".
    p2pAutoConnectService.markChannelReady(peerCid);

    switch (layer.type) {
      case MessagingLayerType.Message:
        await this.handleIncomingMessage(payload, peerCid, recipientCid);
        break;

      case MessagingLayerType.Typing:
        this.handleTypingIndicator(peerCid);
        break;

      case MessagingLayerType.Online:
      case MessagingLayerType.Offline:
      case MessagingLayerType.Away:
        this.handlePresenceUpdate(peerCid, {
          status: layer.type,
          lastUpdate: Date.now()
        });
        break;

      case MessagingLayerType.CustomState:
        this.handlePresenceUpdate(peerCid, {
          status: MessagingLayerType.CustomState,
          customText: layer.text,
          customColor: layer.indicator_icon_color,
          lastUpdate: Date.now()
        });
        break;

      case MessagingLayerType.CheckState:
        await this.config.handleCheckState(peerCid);
        break;

      case MessagingLayerType.CheckStateResponse:
        this.config.handleCheckStateResponse(peerCid);
        break;

      // RE-VFS tree operations
      case MessagingLayerType.RevfsOperation:
        if (isRevfsOperation(layer)) {
          const myCid = await this.config.getCurrentCid();
          if (myCid) {
            void revfsService.handleRevfsOperation(peerCid, myCid, layer.operation);
          }
        }
        break;

      // File Transfer message handling
      case MessagingLayerType.FileTransferRequest:
      case MessagingLayerType.FileTransferResponse:
      case MessagingLayerType.FileTransferProgress:
      case MessagingLayerType.FileTransferComplete:
      case MessagingLayerType.FileTransferCancel:
      case MessagingLayerType.FileTransferChunk:
        debugLog('MessageHandler', '[P2P] Received file transfer message:', layer.type, 'from:', peerCid?.toString().slice(0, 8));
        const effectiveRecipientCid = recipientCid || await this.config.getCurrentCid();
        eventEmitter.emit('p2p:file-transfer-message', {
          layer,
          senderCid: peerCid.toString(),
          recipientCid: effectiveRecipientCid?.toString()
        });
        await this.handleFileTransferMessage(payload, peerCid, recipientCid);
        break;
    }
  }

  /**
   * Handle incoming text message
   */
  private async handleIncomingMessage(payload: P2PMessagingLayerPayload, peerCid: bigint, recipientCid?: bigint): Promise<void> {
    const layer = payload.layer;
    if (!isMessage(layer)) return;

    const message: P2PMessage = {
      id: payload.message_id,
      content: layer.contents,
      senderCid: BigInt(payload.sender_cid),
      recipientCid: BigInt(payload.recipient_cid),
      timestamp: layer.timestamp,
      index: payload.index,
      status: 'delivered',
      replyTo: payload.reply_to,
      mentions: payload.mentions,
      attachments: payload.attachments,
      message_type: payload.message_type || 'text',
      document_id: payload.document_id,
      document_title: payload.document_title
    };

    const wasAdded = await this.config.addMessageToConversation(peerCid, message);

    if (wasAdded) {
      // Send delivery ack BEFORE notifying listeners
      try {
        await this.config.sendMessageAck(message.id, 'delivered', peerCid, recipientCid);
      } catch (error) {
        debugLog('MessageHandler', '[P2P] Delivery ACK send failed (non-blocking):', error);
      }

      debugLog('MessageHandler', '[P2P] Notifying listeners of new message:', message.id);
      this.config.notifyMessageListeners(message);

      eventEmitter.emit('p2p:message-received', {
        peerCid,  // Keep as bigint for consistent typing (useP2PMessages hook expects bigint)
        messageId: message.id,
        text: message.content,
        timestamp: message.timestamp,
        message,
      });

      // Show notification if chat not open
      if (this.config.shouldShowNotification(peerCid)) {
        const conversation = this.config.getConversations().get(peerCid);
        const peerUsername = conversation?.peerUsername || `Peer ${peerCid.toString().slice(0, 8)}`;

        this.config.addNotification(
          `New message from ${peerUsername}`,
          message.content.substring(0, 100),
          peerCid.toString(),
          message.id,
          recipientCid?.toString(),
          { peerCid: peerCid.toString(), onOpen: () => eventEmitter.emit('p2p:open-conversation', { peerCid: peerCid.toString() }) }
        );
      }
    } else {
      debugLog('MessageHandler', '[P2P] Skipping duplicate message notification:', message.id);
    }
  }

  /**
   * Handle message acknowledgment (delegates to MessageAckHandler)
   */
  private async handleMessageAck(payload: Parameters<MessageAckHandler['handleMessageAck']>[0]): Promise<void> {
    return this.ackHandler.handleMessageAck(payload);
  }

  /**
   * Handle typing indicator from peer
   */
  private handleTypingIndicator(peerCid: bigint): void {
    const timestamp = Date.now();
    const conversation = this.config.getOrCreateConversation(peerCid);
    conversation.typing = true;
    conversation.lastTypingUpdate = timestamp;

    this.config.notifyTypingListeners(peerCid, true);

    // Clear typing indicator after display duration
    setTimeout(() => {
      const conv = this.config.getConversations().get(peerCid);
      if (conv && conv.lastTypingUpdate === timestamp) {
        conv.typing = false;
        this.config.notifyTypingListeners(peerCid, false);
      }
    }, TYPING_DISPLAY_DURATION_MS);
  }

  /**
   * Handle presence update from peer
   */
  private handlePresenceUpdate(peerCid: bigint, presence: PeerPresence): void {
    const conversation = this.config.getOrCreateConversation(peerCid);
    conversation.presence = presence;
    this.config.notifyPresenceListeners(peerCid, presence);
  }

  /**
   * Handle file transfer message (delegates to FileTransferMessageHandler)
   */
  private async handleFileTransferMessage(payload: P2PMessagingLayerPayload, peerCid: bigint, _recipientCid?: bigint): Promise<void> {
    return this.fileTransferHandler.handleFileTransferMessage(payload, peerCid);
  }
}
