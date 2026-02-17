/**
 * Message Handler
 *
 * Handles incoming P2P messages from WebSocket and routes them appropriately.
 * Type guards and routing logic are in sibling files.
 */

import type { P2PCommand, P2PMessagingLayerPayload } from '@/types/p2p-types';
import {
  P2PCommandType,
  deserializeP2PCommand,
  isMessagingLayerPayload,
  isMessageAckPayload,
} from '@/types/p2p-types';
import { BroadcastChannelService } from '../broadcast-channel-service';
import { p2pRegistrationService } from '../p2p-registration-service';
import { ensureBigIntOrNull } from '../utils';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';
import { debugLog } from '@/lib/debug-config';
import { eventEmitter } from '../event-emitter';

import type { MessageHandlerConfig } from './message-handler-types';
import { isPeerMessage, isMessageNotification, type MessageNotificationPayload } from './message-handler-types';
import { handleMessagingLayerCommand } from './message-handler-routing';
import { MessageAckHandler } from './message-ack-handler';
import { FileTransferMessageHandler } from './file-transfer-message-handler';

export type { MessageHandlerConfig } from './message-handler-types';

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
    if (isMessageNotification(response)) {
      await this.handleMessageNotification(response);
      return;
    }

    if (isPeerMessage(response)) {
      const { peer_cid, message } = response.PeerMessage;
      try {
        let messageBytes: Uint8Array;
        if (Array.isArray(message)) {
          messageBytes = new Uint8Array(message);
        } else if (message instanceof Uint8Array) {
          messageBytes = message;
        } else {
          debugLog('P2PMessageHandler', 'Unexpected PeerMessage format (expected array or Uint8Array):', typeof message);
          return;
        }
        const command = deserializeP2PCommand(messageBytes);
        const peerCidBigint = ensureBigIntOrNull(peer_cid);
        if (peerCidBigint !== null) {
          await this.handleP2PCommand(command, peerCidBigint);
        }
      } catch (error) {
        debugLog('P2PMessageHandler', 'Failed to deserialize P2P command:', error);
      }
    }
  }

  /**
   * Handle MessageNotification response
   */
  private async handleMessageNotification(
    response: InternalServiceResponse & { MessageNotification: MessageNotificationPayload }
  ): Promise<void> {
    const notification = response.MessageNotification;
    const { message: rawMessage, peer_cid, cid } = notification;

    const currentCid = await this.config.getCurrentCid();
    const peerCidBigint = ensureBigIntOrNull(peer_cid) ?? undefined;
    const notificationCidBigint = ensureBigIntOrNull(cid) ?? undefined;
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

    if (peerCidBigint === undefined || peerCidBigint === 0n) {
      debugLog('MessageHandler', '[P2P] Skipping: no peer_cid or peer_cid is 0');
      return;
    }

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
        debugLog('P2PMessageHandler', 'Unexpected message format (expected array or Uint8Array):', typeof rawMessage);
        return;
      }

      debugLog('MessageHandler', 'P2P message received:', contentBytes.length, 'bytes');

      const rawMessageData = { peerCid: peerCidBigint, message: contentBytes };
      eventEmitter.emit('p2p:raw-message', { peerCid: peerCidBigint.toString(), message: contentBytes });
      BroadcastChannelService.getInstance().broadcastP2PRawMessage(rawMessageData);

      const isOwnOutgoingEcho = peerCidBigint === effectiveCid;
      if (isOwnOutgoingEcho && notificationCidBigint !== effectiveCid) {
        debugLog('MessageHandler', '[P2P] Outgoing echo for different session, broadcasting to follower tabs');
        BroadcastChannelService.getInstance().broadcastP2PNotification({ notification, messageBytes: contentBytes });
        return;
      }

      const isForDifferentSession = notificationCidBigint !== undefined && notificationCidBigint !== effectiveCid;
      if (isForDifferentSession) {
        debugLog('MessageHandler', '[P2P] Message for different session, broadcasting to follower tabs');
        BroadcastChannelService.getInstance().broadcastP2PNotification({ notification, messageBytes: contentBytes });
        return;
      }

      debugLog('MessageHandler', 'P2P MessageNotification received from peer:', peerCidBigint.toString());

      const isAlreadyConnected = this.config.isConnected(peerCidBigint);
      const isAlreadyRegistered = p2pRegistrationService.isPeerRegistered(peerCidBigint);

      if (!isAlreadyRegistered && !isAlreadyConnected) {
        debugLog('P2PMessageHandler', `Received message from unregistered peer ${peerCidBigint.toString()} - protocol violation`);
      }

      const command = deserializeP2PCommand(contentBytes);
      await this.handleP2PCommand(command, peerCidBigint, notificationCidBigint);
    } catch (error) {
      debugLog('P2PMessageHandler', 'Failed to deserialize P2P command:', error);
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
          await handleMessagingLayerCommand(
            this.config,
            this.fileTransferHandler,
            command.payload as P2PMessagingLayerPayload,
            peerCid,
            recipientCid
          );
        } else {
          debugLog('P2PMessageHandler', 'handleP2PCommand: MessagingLayerCommand payload failed type check');
        }
        break;

      case P2PCommandType.MessageAck:
        debugLog('P2PMessageHandler', 'handleP2PCommand: MessageAck branch reached');
        if (isMessageAckPayload(command.payload)) {
          await this.ackHandler.handleMessageAck(command.payload);
        } else {
          debugLog('P2PMessageHandler', 'handleP2PCommand: MessageAck payload failed type check', command.payload);
        }
        break;

      default:
        debugLog('P2PMessageHandler', 'handleP2PCommand: Unknown command type:', command.type);
    }
  }
}
