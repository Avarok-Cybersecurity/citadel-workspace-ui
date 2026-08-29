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
  isYjsSyncPayload,
} from '@/types/p2p-types';
import { BroadcastChannelService } from '../broadcast-channel-service';
import { p2pRegistrationService } from '../p2p-registration-service';
import { ensureBigIntOrNull } from '../utils';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';
import { debugLog } from '@/lib/debug-config';
import { dispatchInboundCommand } from './inbound-command-dispatch';
import { isCallSignalPayload } from '@/types/p2p-commands';
import { eventEmitter } from '../event-emitter';

import { isPeerMessage, isMessageNotification, type MessageNotificationPayload , type MessageHandlerConfig } from './message-handler-types';
import { handleMessagingLayerCommand } from './message-handler-routing';
import { MessageAckHandler } from './message-ack-handler';
import { FileTransferMessageHandler } from './file-transfer-message-handler';

export type { MessageHandlerConfig } from './message-handler-types';
import { fnv1a64 } from './message-fingerprint';
import type { CallSignalPayload } from '@/types/call-signals';

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
        const command: P2PCommand = deserializeP2PCommand(messageBytes);
        const peerCidBigint: bigint | null = ensureBigIntOrNull(peer_cid);
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
    const notification: MessageNotificationPayload = response.MessageNotification;
    const { message: rawMessage, peer_cid, cid } = notification;

    const currentCid: bigint | null = await this.config.getCurrentCid();
    const peerCidBigint: bigint | undefined = ensureBigIntOrNull(peer_cid) ?? undefined;
    const notificationCidBigint: bigint | undefined = ensureBigIntOrNull(cid) ?? undefined;
    const effectiveCid: bigint | undefined = currentCid ?? notificationCidBigint;

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

      // fp joins this to ILM's `[ILM-DELIVER] ... fp=`.
      debugLog('MessageHandler', 'P2P message received:', contentBytes.length, 'bytes fp=' + fnv1a64(contentBytes));

      const rawMessageData: { peerCid: bigint; message: Uint8Array<ArrayBufferLike>; } = { peerCid: peerCidBigint, message: contentBytes };
      eventEmitter.emit('p2p:raw-message', { peerCid: peerCidBigint.toString(), message: contentBytes });
      BroadcastChannelService.getInstance().broadcastP2PRawMessage(rawMessageData);

      const isOwnOutgoingEcho: boolean = peerCidBigint === effectiveCid;
      if (isOwnOutgoingEcho && notificationCidBigint !== effectiveCid) {
        debugLog('MessageHandler', '[P2P] Outgoing echo for different session, broadcasting to follower tabs');
        BroadcastChannelService.getInstance().broadcastP2PNotification({ notification, messageBytes: contentBytes });
        return;
      }

      const isForDifferentSession: boolean = notificationCidBigint !== undefined && notificationCidBigint !== effectiveCid;
      if (isForDifferentSession) {
        debugLog('MessageHandler', '[P2P] Message for different session, broadcasting to follower tabs');
        BroadcastChannelService.getInstance().broadcastP2PNotification({ notification, messageBytes: contentBytes });
        return;
      }

      debugLog('MessageHandler', 'P2P MessageNotification received from peer:', peerCidBigint.toString());

      const isAlreadyConnected: boolean = this.config.isConnected(peerCidBigint);
      const isAlreadyRegistered: boolean = p2pRegistrationService.isPeerRegistered(peerCidBigint);

      if (!isAlreadyRegistered && !isAlreadyConnected) {
        debugLog('P2PMessageHandler', `Received message from unregistered peer ${peerCidBigint.toString()} - protocol violation`);
      }

      await dispatchInboundCommand(contentBytes, (command) =>
        this.handleP2PCommand(command, peerCidBigint, notificationCidBigint)
      );
    } catch (error) {
      debugLog('P2PMessageHandler', 'Could not process inbound P2P message:', error);
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
          await this.ackHandler.handleMessageAck(command.payload, peerCid);
        } else {
          debugLog('P2PMessageHandler', 'handleP2PCommand: MessageAck payload failed type check', command.payload);
        }
        break;

      case P2PCommandType.YjsP2PSync:
        // Dispatch Yjs sync payloads to the Yjs provider via a dedicated
        // event. We do NOT call the Yjs handler inline because each
        // browser tab can host multiple `YjsP2PProvider` instances (one
        // per open document) — emitting lets every interested provider
        // filter on `document_id` / `peerCid` itself.
        if (isYjsSyncPayload(command.payload)) {
          debugLog('P2PMessageHandler', 'handleP2PCommand: dispatching YjsP2PSync', {
            yjsType: command.payload.type,
            documentId: command.payload.document_id,
            peerCid: peerCid.toString(),
          });
          // Pass the canonical `bigint` CID on the wire-internal event
          // (per the CID policy — string conversion is for display/keys/debug
          // only). Subscribers `.toString()` it themselves where they compare.
          eventEmitter.emit('yjs:p2p-command', { peerCid, payload: command.payload });
        } else {
          debugLog('P2PMessageHandler', 'handleP2PCommand: YjsP2PSync payload failed type check', command.payload);
        }
        break;

      case P2PCommandType.CallSignal:
        // Emitted rather than handled inline, for the same reason as Yjs above:
        // the call provider is mounted once per tab and owns the call, and the
        // message handler has no business knowing about media sessions.
        if (isCallSignalPayload(command.payload)) {
          const signal: CallSignalPayload = command.payload;
          debugLog('P2PMessageHandler', 'handleP2PCommand: dispatching CallSignal', {
            kind: signal.kind,
            peerCid: peerCid.toString(),
          });
          eventEmitter.emit('call:signal', { peerCid, payload: signal });
        } else {
          debugLog('P2PMessageHandler', 'handleP2PCommand: CallSignal payload failed type check', command.payload);
        }
        break;

      default:
        debugLog('P2PMessageHandler', 'handleP2PCommand: Unknown command type:', command.type);
    }
  }
}
