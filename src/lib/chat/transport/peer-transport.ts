/**
 * The direct chat's transport: today's wiring of `P2PChat`'s hooks, moved behind the ports.
 *
 * Messages, status and live documents ride the messenger; files ride the file-transfer service
 * (straight to the peer, or into their storage from the send dialog). Every feature is present.
 */
import { P2PMessengerManager } from '@/lib/p2p/p2p-messenger-manager';
import type { ChatPeer } from '@/lib/cdoc/chat/chat-app-ports';
import { fileTransferService } from '@/lib/file-transfer';
import type { FileTransfer } from '@/lib/file-transfer/types';
import { transferDetails, type FileDetails } from '@/components/layout/sidebar/file-details';
import { eventEmitter } from '@/lib/event-emitter';
import { CDOC_CHAT_COMMAND_EVENT, type CdocChatCommandEvent } from '@/types/cdoc-chat-sync';
import type { OpeningPorts } from '@/components/p2p/chat-document/chat-document-opening';
import { createValueStore } from '@/lib/value-store';
import type { GroupRestriction } from '@/components/chat/group-restriction';
import { chatFeatures } from './features';
import { peerHistory } from './peer-history';
import { peerStatus } from './peer-status';
import type { ChatSelf, ChatTransport, DocumentInvitation, DocumentPort, FilePort, FileSendReceipt, SendPort, TextSend } from './chat-transport';

/** Kinds that change what the document shows: an awareness record or a hello does not light the tab. */
const ACTIVITY_KINDS: ReadonlySet<string> = new Set<string>(['update', 'diff', 'rename']);

function peerSend(messenger: P2PMessengerManager, peer: ChatPeer): SendPort {
  return {
    text: async ({ content, messageType, replyTo, onRecorded }: TextSend): Promise<void> => {
      await messenger.sendMessage(peer.cid, content, { messageType, replyTo: replyTo ?? undefined, onOptimisticAppend: onRecorded });
    },
    revise: {
      edit: (messageId: string, content: string): Promise<void> => messenger.editMessage(peer.cid, messageId, content),
      remove: (messageId: string): Promise<void> => messenger.deleteMessage(peer.cid, messageId),
    },
    react: (messageId: string, emoji: string): Promise<void> => messenger.reactToMessage(peer.cid, messageId, emoji),
    retry: (messageId: string): Promise<void> => messenger.resendMessage(peer.cid, messageId),
  };
}

function peerFiles(peer: ChatPeer): FilePort {
  const key: string = peer.cid.toString();
  return {
    modes: ['peer', 'their-storage'],
    destination: `Sent straight to ${peer.name}, encrypted end to end.`,
    dialogKey: key,
    send: async (file: File): Promise<FileSendReceipt> => {
      const id: string = await fileTransferService.sendFile(key, file);
      return { held: fileTransferService.getTransfer(id)?.state === 'queued' };
    },
    accept: (transferId: string): Promise<void> => fileTransferService.acceptTransfer(transferId),
    decline: (transferId: string): Promise<void> => fileTransferService.declineTransfer(transferId),
    cancel: (transferId: string): Promise<void> => fileTransferService.cancelTransfer(transferId),
    // The file is on the agent's own filesystem and the browser has no route to it, so what arrived
    // and where it was saved is the answer (see FilePreviewDialog).
    details: (transferId: string): FileDetails | null => {
      const transfer: FileTransfer | undefined = fileTransferService.getTransfer(transferId);
      if (!transfer?.downloadPath) return null;
      return transferDetails(transfer, (cid: string): string | undefined => (cid === key ? peer.name : undefined)).details;
    },
    read: null,
  };
}

function peerDocuments(messenger: P2PMessengerManager, peer: ChatPeer, opening: OpeningPorts): DocumentPort {
  return {
    sharedWith: `Shared live with ${peer.name}`,
    opening,
    invite: async ({ docId, title, onRecorded }: DocumentInvitation): Promise<void> => {
      await messenger.sendMessage(peer.cid, `Created live document: ${title}`, {
        messageType: 'live_document', documentId: docId, documentTitle: title, onOptimisticAppend: onRecorded,
      });
    },
    onActivity: (listener: (docId: string) => void): (() => void) =>
      eventEmitter.on<CdocChatCommandEvent>(CDOC_CHAT_COMMAND_EVENT, (event: CdocChatCommandEvent): void => {
        if (event.peerCid === peer.cid && ACTIVITY_KINDS.has(event.payload.sync.kind)) listener(event.payload.doc_id);
      }),
  };
}

export interface PeerTransportParams {
  readonly peer: ChatPeer;
  /** Null until the session has a CID. */
  readonly self: ChatSelf | null;
  readonly opening: OpeningPorts;
}

export function createPeerTransport({ peer, self, opening }: PeerTransportParams): ChatTransport {
  const messenger: P2PMessengerManager = P2PMessengerManager.getInstance();
  const ports: Pick<ChatTransport, 'send' | 'status' | 'files' | 'documents' | 'settings'> = {
    send: peerSend(messenger, peer),
    status: peerStatus(messenger, peer),
    files: peerFiles(peer),
    documents: peerDocuments(messenger, peer, opening),
    settings: { key: peer.cid.toString() },
  };
  return {
    kind: 'peer',
    conversationKey: peer.cid.toString(),
    self,
    counterpart: { name: peer.name, username: peer.username, greeting: `Say hello to ${peer.name}. Messages are end-to-end encrypted.` },
    features: chatFeatures(ports, {
      markdown: true, readReceipts: true, securityLevel: true, retention: true, optimistic: true, namesSenders: false,
    }),
    // A direct chat has no roles: whoever is in it may write.
    sendGate: createValueStore<GroupRestriction>(`chat-send-gate:${peer.cid.toString()}`, 'allowed'),
    history: peerHistory(messenger, peer, self),
    ...ports,
    // Two parties, so a reactor is either the reader or the peer.
    reactorName: (cid: bigint): string => (self !== null && cid === self.cid ? 'You' : peer.name),
  };
}
