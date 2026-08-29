/**
 * P2P Messenger Manager
 *
 * Orchestrates P2P messaging by delegating to specialized modules:
 * - ConversationManager: Conversation state management
 * - MessageHandler: Incoming message processing
 * - MessageSender: Outgoing message sending
 * - PresenceManager: Presence and typing indicators
 * - CheckStateManager: CheckState handshake protocol
 * - MessagePaginationStore: IndexedDB persistence
 */

import type { MessagingLayer } from '@/types/messaging-layer';
import { markP2PMessageHandlerAttached } from './p2p-handler-ready';
import { editMessage, deleteMessage } from './messenger-revision';
import { websocketService } from '../websocket-service';
import { notificationService } from '../notification-service';
import { EventListenerManager } from '../utils/event-listener-manager';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';

import type { P2PMessage, P2PConversation, PeerPresence } from './p2p-types';
import { messagePaginationStore } from './message-pagination-store';
import { eventEmitter } from '@/lib/event-emitter';
import { PresenceManager } from './presence-manager';
import { CheckStateManager } from './checkstate-manager';
import { MessageHandler } from './message-handler';
import { MessageSender } from './message-sender';
import type { SendMessageOptions } from './message-sender-types';
import { ConversationManager } from './conversation-manager';
import { resolveCurrentCid, updatePeerPresenceOnConnect, updatePeerPresenceOnDisconnect } from './messenger-cid-resolver';
import { syncConnectionsFromBackend, updateFileTransferState, markMessagesAsRead, updateUnreadCount, autoRegisterPeer } from './messenger-compatibility';
import { debugLog } from '@/lib/debug-config';
import { TIMEOUT } from '../timeout-constants';
import type { MessagePage, ConversationMetadata } from '@/lib/p2p/p2p-types';

export class P2PMessengerManager extends EventListenerManager {
  private static instance: P2PMessengerManager;
  private messageListeners: ((message: P2PMessage) => void)[] = [];
  private messageStatusListeners: ((messageId: string, status: P2PMessage['status']) => void)[] = [];
  private connectionListeners: ((peerCid: bigint, connected: boolean) => void)[] = [];
  private initPromise: Promise<void> | null = null;
  private isReady: boolean = false;
  private cachedMessagesLoaded: boolean = false;
  private activeConversationPeerCid: bigint | null = null;
  private readonly conversationManager: ConversationManager;
  private readonly presenceManager: PresenceManager;
  private readonly checkStateManager: CheckStateManager;
  private readonly messageHandler: MessageHandler;
  private readonly messageSender: MessageSender;

  private constructor() {
    super();
    this.conversationManager = new ConversationManager({ getCurrentCid: (): Promise<bigint | null> => resolveCurrentCid(), maxMessagesPerConversation: 100, maxQueueSize: 100 });
    this.presenceManager = new PresenceManager({
      sendCommand: (peerCid, layer): Promise<void> => this.messageSender.sendRawMessage(peerCid, layer),
      getConnectedPeers: (): bigint[] => Array.from(this.conversationManager.getConnections().entries()).filter(([, c]) => c).map(([p]): bigint => p)
    });
    this.checkStateManager = new CheckStateManager({
      timeout: TIMEOUT.CHECKSTATE_MS,
      sendToP2P: (peerCid, bytes): Promise<void> => this.messageSender.sendRawBytes(peerCid, bytes),
      getCurrentCid: (): Promise<bigint | null> => resolveCurrentCid(),
      getLastMessageIndex: (peerCid): number => this.conversationManager.getOrCreateConversation(peerCid).lastMessageIndex
    });
    this.messageSender = new MessageSender({
      getCurrentCid: (): Promise<bigint | null> => resolveCurrentCid(),
      getOrCreateConversation: (peerCid): P2PConversation => this.conversationManager.getOrCreateConversation(peerCid),
      addMessageToConversation: (peerCid, message): Promise<boolean> => this.conversationManager.addMessageToConversation(peerCid, message),
      findStoredMessage: (p, id): Promise<P2PMessage | null> => messagePaginationStore.findMessageInPages(p, id),

      updateMessageInPages: (peerCid, messageId, updates): Promise<boolean> => messagePaginationStore.updateMessageInPages(peerCid, messageId, updates),
      emitEvent: (event, data): void => this.emit(event, data),
      notifyMessageListeners: (message): void => this.messageListeners.forEach(l => l(message)),
      notifyMessageStatusListeners: (messageId, status): void => this.messageStatusListeners.forEach(l => l(messageId, status)),
      isConnected: (peerCid): boolean => this.conversationManager.isConnected(peerCid),
      tryEnsurePeerReady: (peerCid): Promise<boolean> => this.checkStateManager.tryEnsurePeerReady(peerCid)
    });
    this.messageHandler = new MessageHandler({
      getCurrentCid: (): Promise<bigint | null> => resolveCurrentCid(),
      isConnected: (peerCid): boolean => this.conversationManager.isConnected(peerCid),
      getOrCreateConversation: (peerCid): P2PConversation => this.conversationManager.getOrCreateConversation(peerCid),
      addMessageToConversation: (peerCid, message): Promise<boolean> => this.conversationManager.addMessageToConversation(peerCid, message),
      updateMessageInPages: (peerCid, messageId, updates): Promise<boolean> => messagePaginationStore.updateMessageInPages(peerCid, messageId, updates),
      getConversations: (): Map<bigint, P2PConversation> => this.conversationManager.getConversationsMap(),
      notifyMessageListeners: (message): void => this.messageListeners.forEach(l => l(message)),
      notifyMessageStatusListeners: (messageId, status): void => this.messageStatusListeners.forEach(l => l(messageId, status)),
      notifyTypingListeners: (peerCid, isTyping): void => this.presenceManager.notifyTypingChange(peerCid, isTyping),
      notifyPresenceListeners: (peerCid, presence): void => this.presenceManager.notifyPresenceChange(peerCid, presence),
      sendMessageAck: (messageId, ackType, peerCid, recipientCid): Promise<void> => this.messageSender.sendMessageAck(messageId, ackType, peerCid, recipientCid),
      handleCheckState: (peerCid): Promise<void> => this.checkStateManager.handleCheckState(peerCid),
      handleCheckStateResponse: (peerCid): void => this.checkStateManager.handleCheckStateResponse(peerCid),
      markPeerReady: (peerCid): void => this.checkStateManager.markPeerReady(peerCid),
      shouldShowNotification: (peerCid): boolean => this.activeConversationPeerCid !== peerCid,
      addNotification: (title, body, senderId, messageId, recipientCid, options) =>
        notificationService.addMessageNotification(title, body, senderId, messageId, recipientCid, options)
    });
    this.setupEventListeners();
    // `canSendRequests`, not `isConnected`: the latter is false in every follower
    // tab for ever. This was correct today only by boot ordering -- main.tsx
    // constructs the manager before init runs, so the connection-success
    // listener below rescued followers. Any future caller constructing it later
    // would have booted them with an empty conversation history.
    if (websocketService.canSendRequests()) {
      this.initPromise = this.loadCachedMessages().then(() => { this.isReady = true; this.emit('p2p:messages-loaded'); })
        .catch(err => debugLog('P2PMessengerManager', 'Loading cached messages failed:', err));
    }
  }

  public static getInstance(): P2PMessengerManager {
    if (!P2PMessengerManager.instance) { P2PMessengerManager.instance = new P2PMessengerManager(); }
    return P2PMessengerManager.instance;
  }

  public async waitForReady(): Promise<void> { if (this.isReady) return; if (this.initPromise) await this.initPromise; }

  protected setupEventListeners(): void {
    this.listen('on-ws-connection-success', async () => {
      if (this.cachedMessagesLoaded) return;
      debugLog('P2PMessengerManager', '[P2P] WebSocket connected, loading cached messages...');
      await this.loadCachedMessages();
      if (this.cachedMessagesLoaded) { this.isReady = true; this.emit('p2p:messages-loaded'); }
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.checkStateManager.flushPendingCheckStateResponses();
      });
    }
    this.listen<InternalServiceResponse>('websocket-message', (response) => { void this.messageHandler.handleWebSocketMessage(response); });
    // Marked immediately after the subscription, not before: the inbound router
    // acks a forwarded message only once this is set, and acking before the
    // handler is attached would confirm a delivery that never happened.
    markP2PMessageHandlerAttached();
    this.listen<{ peerCid: bigint }>('p2p-connection-established', ({ peerCid }) => {
      this.conversationManager.setConnection(peerCid, true);
      this.connectionListeners.forEach(l => l(peerCid, true));
      this.checkStateManager.markPeerReady(peerCid);
      updatePeerPresenceOnConnect(this.conversationManager, this.presenceManager, (e, d) => this.emit(e, d), peerCid);
    });
    this.listen<{ peerCid: bigint }>('p2p-connection-lost', ({ peerCid }) => {
      this.conversationManager.setConnection(peerCid, false);
      this.connectionListeners.forEach(l => l(peerCid, false));
      this.checkStateManager.clearPeerReadyState(peerCid);
      updatePeerPresenceOnDisconnect(this.conversationManager, this.presenceManager, (e, d) => this.emit(e, d), peerCid);
    });
    this.listen<{ peer: { cid: bigint; username: string } }>('p2p:peer-registered', ({ peer }) => {
      if (peer.cid && peer.username) this.conversationManager.setPeerUsername(peer.cid, peer.username);
    });
  }

  private async loadCachedMessages(): Promise<void> { await this.conversationManager.loadFromStorage(); this.cachedMessagesLoaded = true; }

  // ===== Public API: Messaging =====
  public async sendMessage(recipientCid: bigint, content: string, options?: SendMessageOptions): Promise<P2PMessage> { return this.messageSender.sendMessage(recipientCid, content, options); }
  public async resendMessage(peerCid: bigint, messageId: string): Promise<void> { const c: P2PConversation | undefined = this.conversationManager.getConversation(peerCid); if (!c) throw new Error(`Conversation with ${peerCid} not found`); return this.messageSender.resendMessage(peerCid, messageId, c); }
  public async sendRawMessage(recipientCid: bigint, layer: MessagingLayer): Promise<void> { return this.messageSender.sendRawMessage(recipientCid, layer); }
  public async editMessage(peerCid: bigint, messageId: string, contents: string): Promise<void> { return editMessage(this.conversationManager, (e, d) => this.emit(e, d), (p, l) => this.sendRawMessage(p, l), peerCid, messageId, contents); }
  public async deleteMessage(peerCid: bigint, messageId: string): Promise<void> { return deleteMessage(this.conversationManager, (e, d) => this.emit(e, d), (p, l) => this.sendRawMessage(p, l), peerCid, messageId); }
  public async markMessagesAsRead(peerCid: bigint, messageIds?: string[]): Promise<void> { return markMessagesAsRead(this.conversationManager, (msgId, ackType, peer) => this.messageSender.sendMessageAck(msgId, ackType, peer), (e, d) => this.emit(e, d), peerCid, messageIds); }

  // ===== Public API: Presence =====
  public async sendPresenceUpdate(recipientCid: bigint, presence: MessagingLayer): Promise<void> { return this.presenceManager.sendPresenceUpdate(recipientCid, presence); }
  public async broadcastPresence(presence: MessagingLayer): Promise<void> { return this.presenceManager.broadcastPresence(presence); }
  public getOwnPresence(): PeerPresence { return this.presenceManager.getOwnPresence(); }
  public startTypingPolling(recipientCid: bigint, getCurrentText: () => string): void { this.presenceManager.startTypingPolling(recipientCid, getCurrentText); }
  public stopTypingPolling(recipientCid: bigint): void { this.presenceManager.stopTypingPolling(recipientCid); }
  public async sendTypingIndicator(recipientCid: bigint): Promise<void> { return this.presenceManager.sendTypingIndicator(recipientCid); }

  // ===== Public API: Conversations =====
  public getConversation(peerCid: bigint): P2PConversation | undefined { return this.conversationManager.getConversation(peerCid); }
  public getAllConversations(): P2PConversation[] { return this.conversationManager.getAllConversations(); }
  public getRecentMessages(limit: number = 50): P2PMessage[] { return this.conversationManager.getRecentMessages(limit); }
  public isConnected(peerCid: bigint): boolean { return this.conversationManager.isConnected(peerCid); }
  public setPeerUsername(peerCid: bigint, username: string): void { this.conversationManager.setPeerUsername(peerCid, username); }
  public async cleanupStaleConversations(validPeerCids: Set<bigint>): Promise<number> { return this.conversationManager.cleanupStaleConversations(validPeerCids); }

  /**
   * Erase the stored history for one peer, for real.
   *
   * Chat Settings offered "Clear Chat History" and ran
   * `localStorage.removeItem('chat-history:' + peerCid)` — a key nothing in the
   * app has ever written. The dialog said "Messages stored on this device are
   * removed. This cannot be undone." and not one message was removed. In a
   * product sold on privacy that is the worst kind of defect: the user is told
   * their data is gone and it is not.
   *
   * Both halves are needed. deleteConversationPages clears what survives a
   * reload; clearMessages clears what is on screen now.
   */
  public async clearConversationHistory(peerCid: bigint): Promise<void> {
    // includeUnattributed: the user has this conversation open and pressed
    // clear. Refusing on an unstamped legacy record would make their own
    // button do nothing.
    await messagePaginationStore.deleteConversationPages(peerCid, {
      ownerCid: await resolveCurrentCid(),
      includeUnattributed: true,
    });
    this.conversationManager.clearMessages(peerCid);
    eventEmitter.emit('p2p:conversation-cleared', { peerCid });
  }
  public async loadMessagePage(peerCid: bigint, pageNumber: number): Promise<MessagePage | null> { return messagePaginationStore.loadMessagePage(peerCid, pageNumber); }
  public async loadLatestMessages(peerCid: bigint): Promise<P2PMessage[]> { return messagePaginationStore.loadLatestMessages(peerCid); }
  public async getConversationMetadata(peerCid: bigint): Promise<ConversationMetadata | null> { return messagePaginationStore.loadMetadata(peerCid); }

  // ===== Public API: Event Listeners =====
  public onMessage(listener: (message: P2PMessage) => void): () => void { this.messageListeners.push(listener); return () => { this.messageListeners = this.messageListeners.filter(l => l !== listener); }; }
  public onMessageStatusChange(listener: (messageId: string, status: P2PMessage['status']) => void): () => void { this.messageStatusListeners.push(listener); return () => { this.messageStatusListeners = this.messageStatusListeners.filter(l => l !== listener); }; }
  public onTyping(listener: (peerCid: bigint, isTyping: boolean) => void): () => void { return this.presenceManager.onTyping(listener); }
  public onConnectionChange(listener: (peerCid: bigint, connected: boolean) => void): () => void { this.connectionListeners.push(listener); return () => { this.connectionListeners = this.connectionListeners.filter(l => l !== listener); }; }
  public onPresenceChange(listener: (peerCid: bigint, presence: PeerPresence) => void): () => void { return this.presenceManager.onPresenceChange(listener); }
  public setActiveConversation(peerCid: bigint | null): void { this.activeConversationPeerCid = peerCid; }

  // ===== Compatibility Methods =====
  public async syncConnectionsFromBackend(): Promise<void> { return syncConnectionsFromBackend(this.conversationManager, () => resolveCurrentCid(), (peerCid) => updatePeerPresenceOnConnect(this.conversationManager, this.presenceManager, (e, d) => this.emit(e, d), peerCid)); }
  public ensurePeerReady(peerCid: bigint): Promise<void> { return this.checkStateManager.ensurePeerReady(peerCid); }
  public isPeerReady(peerCid: bigint): boolean { return this.checkStateManager.isPeerReady(peerCid); }
  public clearPeerReadyState(peerCid: bigint): void { this.checkStateManager.clearPeerReadyState(peerCid); }
  public updateFileTransferState(peerCid: bigint, transferId: string, updates: { transfer_state?: P2PMessage['transfer_state']; transfer_progress?: number }): void { updateFileTransferState(this.conversationManager, (e, d) => this.emit(e, d), peerCid, transferId, updates); }
  public markAsRead(peerCid: bigint): void { void this.markMessagesAsRead(peerCid); }
  public async updateUnreadCount(peerCid: bigint, unreadCount: number): Promise<void> { return updateUnreadCount(this.conversationManager, peerCid, unreadCount); }
  public async autoRegisterPeer(peerCid: bigint): Promise<void> { return autoRegisterPeer(() => resolveCurrentCid(), (e, d) => this.emit(e, d), peerCid); }
  public async autoRegisterPeerWithCid(peerCid: bigint, ownCid: bigint | null | undefined): Promise<void> { if (!ownCid) throw new Error('No CID provided for registration'); return autoRegisterPeer(() => resolveCurrentCid(), (e, d) => this.emit(e, d), peerCid, ownCid); }
}

// Lazy singleton — deferred to first access to avoid circular dependency TDZ.
// The constructor accesses websocketService which may not be initialized during
// module evaluation due to circular imports.
let _p2pInstance: P2PMessengerManager | null = null;
export function getP2PMessengerManager(): P2PMessengerManager {
  if (!_p2pInstance) { _p2pInstance = P2PMessengerManager.getInstance(); }
  return _p2pInstance;
}
// Backward-compatible alias (accessed lazily via Proxy for existing destructured imports).
// Both `get` and `set` delegate to the real singleton so external callers that
// assign to exposed fields write through to the real instance rather than
// silently landing on the empty placeholder target.
export const p2pMessengerManager: P2PMessengerManager = new Proxy({} as P2PMessengerManager, {
  get(_target: P2PMessengerManager, prop: string | symbol, receiver: unknown): unknown {
    return Reflect.get(getP2PMessengerManager(), prop, receiver);
  },
  set(_target: P2PMessengerManager, prop: string | symbol, value: unknown, receiver: unknown): boolean {
    return Reflect.set(getP2PMessengerManager(), prop, value, receiver);
  },
});
