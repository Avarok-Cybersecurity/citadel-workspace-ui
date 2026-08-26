/**
 * Message Handler - Routing Logic
 *
 * Handles MessagingLayer command routing: incoming messages, typing,
 * presence, file transfers, and RevFS operations.
 */

import type { P2PMessagingLayerPayload } from '@/types/p2p-types';
import {
  MessagingLayerType,
  isMessage,
  isRevfsOperation,
  TYPING_DISPLAY_DURATION_MS,
} from '@/types/messaging-layer';
import { eventEmitter } from '../event-emitter';
import { applyEdit, applyDelete } from './message-revision';
import { p2pAutoConnectService } from '../p2p-auto-connect-service';
import { revfsService } from '@/lib/revfs';
import { debugLog } from '@/lib/debug-config';
import type { P2PMessage, PeerPresence } from './p2p-types';
import type { MessageHandlerConfig } from './message-handler-types';
import type { FileTransferMessageHandler } from './file-transfer-message-handler';

/**
 * Handle a MessagingLayer command by dispatching to the appropriate handler.
 */
export async function handleMessagingLayerCommand(
  config: MessageHandlerConfig,
  fileTransferHandler: FileTransferMessageHandler,
  payload: P2PMessagingLayerPayload,
  peerCid: bigint,
  recipientCid?: bigint
): Promise<void> {
  const { layer } = payload;

  config.markPeerReady(peerCid);
  p2pAutoConnectService.markChannelReady(peerCid);

  switch (layer.type) {
    case MessagingLayerType.Message:
      await handleIncomingMessage(config, payload, peerCid, recipientCid);
      break;

    case MessagingLayerType.MessageEdit: {
      const conversation = config.getOrCreateConversation(peerCid);
      const outcome = applyEdit(conversation, layer.message_id, layer.contents, layer.edited_at, peerCid);
      if (!outcome.applied) {
        // Do not swallow this. An edit for a message we do not have, or one the
        // peer did not send, means our view and theirs have diverged.
        debugLog('P2PMessageHandler', `Ignored edit of ${layer.message_id}: ${outcome.reason}`);
        break;
      }
      await config.updateMessageInPages(peerCid, layer.message_id, {
        content: layer.contents,
        edited_at: layer.edited_at,
      });
      eventEmitter.emit('p2p:message-updated', outcome.message);
      break;
    }

    case MessagingLayerType.MessageDelete: {
      const conversation = config.getOrCreateConversation(peerCid);
      const outcome = applyDelete(conversation, layer.message_id, peerCid);
      if (!outcome.applied) {
        debugLog('P2PMessageHandler', `Ignored delete of ${layer.message_id}: ${outcome.reason}`);
        break;
      }
      eventEmitter.emit('p2p:message-deleted', { peerCid, messageId: layer.message_id });
      break;
    }

    case MessagingLayerType.Typing:
      handleTypingIndicator(config, peerCid);
      break;

    case MessagingLayerType.Online:
    case MessagingLayerType.Offline:
    case MessagingLayerType.Away:
      handlePresenceUpdate(config, peerCid, {
        status: layer.type,
        lastUpdate: Date.now(),
      });
      break;

    case MessagingLayerType.CustomState:
      handlePresenceUpdate(config, peerCid, {
        status: MessagingLayerType.CustomState,
        customText: layer.text,
        customColor: layer.indicator_icon_color,
        lastUpdate: Date.now(),
      });
      break;

    case MessagingLayerType.CheckState:
      await config.handleCheckState(peerCid);
      break;

    case MessagingLayerType.CheckStateResponse:
      config.handleCheckStateResponse(peerCid);
      break;

    case MessagingLayerType.RevfsOperation:
      if (isRevfsOperation(layer)) {
        const myCid = await config.getCurrentCid();
        if (myCid) {
          void revfsService.handleRevfsOperation(peerCid, myCid, layer.operation);
        }
      }
      break;

    case MessagingLayerType.FileTransferRequest:
    case MessagingLayerType.FileTransferResponse:
    case MessagingLayerType.FileTransferProgress:
    case MessagingLayerType.FileTransferComplete:
    case MessagingLayerType.FileTransferCancel:
    case MessagingLayerType.FileTransferChunk: {
      debugLog('P2PMessageHandler', 'Received file transfer message:', layer.type, 'from:', peerCid?.toString().slice(0, 8));
      const effectiveRecipientCid = recipientCid || (await config.getCurrentCid());
      eventEmitter.emit('p2p:file-transfer-message', {
        layer,
        senderCid: peerCid.toString(),
        recipientCid: effectiveRecipientCid?.toString(),
      });
      await fileTransferHandler.handleFileTransferMessage(payload, peerCid);
      break;
    }
    default:
      // Unhandled types left the switch with no trace, reading identically to
      // "never arrived" - the blind spot that made the reconnect loss
      // unplaceable, since ILM proved delivery and the client proved nothing.
      debugLog('P2PMessageHandler', '[LOSS-DIAG] dropped: no handler for layer type',
        (layer as { type?: unknown }).type, 'message_id=', payload.message_id);
      break;
  }
}

/**
 * Handle an incoming text message from a peer.
 */
async function handleIncomingMessage(
  config: MessageHandlerConfig,
  payload: P2PMessagingLayerPayload,
  peerCid: bigint,
  recipientCid?: bigint
): Promise<void> {
  const layer = payload.layer;
  if (!isMessage(layer)) {
    // Silent before this: a payload routed as a message but failing the shape
    // check vanished with no line anywhere - indistinguishable from one the
    // network never delivered, though ILM's logs prove delivery.
    debugLog('P2PMessageHandler', '[LOSS-DIAG] dropped: failed isMessage',
      'message_id=', payload.message_id, 'type=', (layer as { type?: unknown }).type);
    return;
  }

  const message: P2PMessage = {
    id: payload.message_id,
    content: layer.contents,
    // The TRANSPORT's peer, not the payload's claim.
    //
    // `payload.sender_cid` is attacker-chosen: a peer could set it to the
    // recipient's own CID, and converters.ts renders `senderCid === currentUserId`
    // right-aligned and labelled "You" — a forged message from yourself, in your
    // own transcript. `peerCid` is the authenticated channel identity, and the
    // edit path a few lines above already uses it for exactly this reason.
    senderCid: peerCid,
    recipientCid: BigInt(payload.recipient_cid),
    timestamp: layer.timestamp,
    index: payload.index,
    status: 'delivered',
    replyTo: payload.reply_to,
    mentions: payload.mentions,
    attachments: payload.attachments,
    message_type: payload.message_type || 'text',
    document_id: payload.document_id,
    document_title: payload.document_title,
  };

  const wasAdded = await config.addMessageToConversation(peerCid, message);

  // Diagnostic for the reconnect message loss, which reproduces only under CI
  // load. Every layer above this is eliminated: ILM delivers, the notification
  // reaches the right instance, and the handler decodes it — yet two of three
  // messages never appear in the conversation. This logs the CONTENT, which the
  // existing lines do not, so the next failing run says which message was
  // dropped and whether the store accepted it.
  debugLog(
    'P2PMessageHandler',
    `[LOSS-DIAG] id=${message.id} added=${wasAdded} index=${message.index} text=${JSON.stringify(
      String(message.content ?? '').slice(0, 60),
    )}`,
  );

  if (wasAdded) {
    try {
      await config.sendMessageAck(message.id, 'delivered', peerCid, recipientCid);
    } catch (error) {
      debugLog('P2PMessageHandler', 'Delivery ACK send failed (non-blocking):', error);
    }

    debugLog('P2PMessageHandler', 'Notifying listeners of new message:', message.id);
    config.notifyMessageListeners(message);

    eventEmitter.emit('p2p:message-received', {
      peerCid,
      messageId: message.id,
      text: message.content,
      timestamp: message.timestamp,
      message,
    });

    if (config.shouldShowNotification(peerCid)) {
      const conversation = config.getConversations().get(peerCid);
      const peerUsername = conversation?.peerUsername || `Peer ${peerCid.toString().slice(0, 8)}`;

      config.addNotification(
        `New message from ${peerUsername}`,
        message.content.substring(0, 100),
        peerCid.toString(),
        message.id,
        recipientCid?.toString(),
        { peerCid: peerCid.toString(), onOpen: () => eventEmitter.emit('p2p:open-conversation', { peerCid: peerCid.toString() }) }
      );
    }
  } else {
    debugLog('P2PMessageHandler', 'Skipping duplicate message notification:', message.id);
  }
}

/**
 * Handle a typing indicator from a peer.
 */
function handleTypingIndicator(config: MessageHandlerConfig, peerCid: bigint): void {
  const timestamp = Date.now();
  const conversation = config.getOrCreateConversation(peerCid);
  conversation.typing = true;
  conversation.lastTypingUpdate = timestamp;

  config.notifyTypingListeners(peerCid, true);

  setTimeout(() => {
    const conv = config.getConversations().get(peerCid);
    if (conv && conv.lastTypingUpdate === timestamp) {
      conv.typing = false;
      config.notifyTypingListeners(peerCid, false);
    }
  }, TYPING_DISPLAY_DURATION_MS);
}

/**
 * Handle a presence update from a peer.
 */
function handlePresenceUpdate(config: MessageHandlerConfig, peerCid: bigint, presence: PeerPresence): void {
  const conversation = config.getOrCreateConversation(peerCid);
  conversation.presence = presence;
  config.notifyPresenceListeners(peerCid, presence);
}
