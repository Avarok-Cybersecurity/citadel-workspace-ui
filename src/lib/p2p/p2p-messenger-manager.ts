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

import { MessagingLayerType, createOnline } from '@/types/messaging-layer';
import type { MessagingLayer } from '@/types/messaging-layer';
import type { MessageType } from '@/types/message-protocol';
import { websocketService } from '../websocket-service';
import { connectionManager } from '../connection';
import { getSelectedUser } from '../tab-context';
import { instanceManager } from '../multi-instance';
import { notificationService } from '../notification-service';
import { p2pAutoConnectService } from '../p2p-auto-connect-service';
import { EventListenerManager } from '../utils/event-listener-manager';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';

import type { P2PMessage, P2PConversation, PeerPresence } from './p2p-types';
import { messagePaginationStore } from './message-pagination-store';
import { PresenceManager } from './presence-manager';
import { CheckStateManager } from './checkstate-manager';
import { MessageHandler } from './message-handler';
import { MessageSender } from './message-sender';
import { ConversationManager } from './conversation-manager';

const CHECKSTATE_TIMEOUT = 3000;

export class P2PMessengerManager extends EventListenerManager {
  private static instance: P2PMessengerManager;

  private messageListeners: ((message: P2PMessage) => void)[] = [];
  private messageStatusListeners: ((messageId: string, status: P2PMessage['status']) => void)[] = [];
  private connectionListeners: ((peerCid: bigint, connected: boolean) => void)[] = [];

  private initPromise: Promise<void> | null = null;
  private isReady = false;
  private cachedMessagesLoaded = false;
  private activeConversationPeerCid: bigint | null = null;

  private readonly conversationManager: ConversationManager;
  private readonly presenceManager: PresenceManager;
  private readonly checkStateManager: CheckStateManager;
  private readonly messageHandler: MessageHandler;
  private readonly messageSender: MessageSender;

  private constructor() {
    super();
    // Initialize conversation manager first
    this.conversationManager = new ConversationManager({
      getCurrentCid: () => this.getCurrentCid(),
      maxMessagesPerConversation: 100,
      maxQueueSize: 100
    });

    // Initialize presence manager
    this.presenceManager = new PresenceManager({
      sendCommand: (peerCid, layer) => this.messageSender.sendRawMessage(peerCid, layer),
      getConnectedPeers: () => Array.from(this.conversationManager.getConnections().entries())
        .filter(([, connected]) => connected)
        .map(([peerCid]) => peerCid)
    });

    // Initialize checkstate manager
    this.checkStateManager = new CheckStateManager({
      timeout: CHECKSTATE_TIMEOUT,
      sendToP2P: (peerCid, bytes) => this.messageSender.sendRawBytes(peerCid, bytes),
      getCurrentCid: () => this.getCurrentCid(),
      getLastMessageIndex: (peerCid) => this.conversationManager.getOrCreateConversation(peerCid).lastMessageIndex
    });

    // Initialize message sender
    this.messageSender = new MessageSender({
      getCurrentCid: () => this.getCurrentCid(),
      getOrCreateConversation: (peerCid) => this.conversationManager.getOrCreateConversation(peerCid),
      addMessageToConversation: (peerCid, message) => this.conversationManager.addMessageToConversation(peerCid, message),
      updateMessageInPages: (peerCid, messageId, updates) => messagePaginationStore.updateMessageInPages(peerCid, messageId, updates),
      notifyMessageListeners: (message) => this.messageListeners.forEach(l => l(message)),
      notifyMessageStatusListeners: (messageId, status) => this.messageStatusListeners.forEach(l => l(messageId, status)),
      isConnected: (peerCid) => this.conversationManager.isConnected(peerCid),
      tryEnsurePeerReady: (peerCid) => this.checkStateManager.tryEnsurePeerReady(peerCid)
    });

    // Initialize message handler
    this.messageHandler = new MessageHandler({
      getCurrentCid: () => this.getCurrentCid(),
      isConnected: (peerCid) => this.conversationManager.isConnected(peerCid),
      getOrCreateConversation: (peerCid) => this.conversationManager.getOrCreateConversation(peerCid),
      addMessageToConversation: (peerCid, message) => this.conversationManager.addMessageToConversation(peerCid, message),
      updateMessageInPages: (peerCid, messageId, updates) => messagePaginationStore.updateMessageInPages(peerCid, messageId, updates),
      getConversations: () => this.conversationManager.getConversationsMap(),
      notifyMessageListeners: (message) => this.messageListeners.forEach(l => l(message)),
      notifyMessageStatusListeners: (messageId, status) => this.messageStatusListeners.forEach(l => l(messageId, status)),
      notifyTypingListeners: (peerCid, isTyping) => this.presenceManager.notifyTypingChange(peerCid, isTyping),
      notifyPresenceListeners: (peerCid, presence) => this.presenceManager.notifyPresenceChange(peerCid, presence),
      sendMessageAck: (messageId, ackType, peerCid, recipientCid) => this.messageSender.sendMessageAck(messageId, ackType, peerCid, recipientCid),
      handleCheckState: (peerCid) => this.checkStateManager.handleCheckState(peerCid),
      handleCheckStateResponse: (peerCid) => this.checkStateManager.handleCheckStateResponse(peerCid),
      markPeerReady: (peerCid) => this.checkStateManager.markPeerReady(peerCid),
      shouldShowNotification: (peerCid) => this.activeConversationPeerCid !== peerCid,
      addNotification: (title, body, senderId, messageId, recipientCid, options) =>
        notificationService.addMessageNotification(title, body, senderId, messageId, recipientCid, options)
    });

    this.setupEventListeners();

    if (websocketService.isConnected()) {
      this.initPromise = this.loadCachedMessages().then(() => {
        this.isReady = true;
        this.emit('p2p:messages-loaded');
      });
    }
  }

  public static getInstance(): P2PMessengerManager {
    if (!P2PMessengerManager.instance) {
      P2PMessengerManager.instance = new P2PMessengerManager();
    }
    return P2PMessengerManager.instance;
  }

  public async waitForReady(): Promise<void> {
    if (this.isReady) return;
    if (this.initPromise) await this.initPromise;
  }

  protected setupEventListeners(): void {
    // WebSocket connection
    this.listen('on-ws-connection-success', async () => {
      if (this.cachedMessagesLoaded) return;
      console.log('[P2P] WebSocket connected, loading cached messages...');
      await this.loadCachedMessages();
      if (this.cachedMessagesLoaded) {
        this.isReady = true;
        this.emit('p2p:messages-loaded');
      }
    });

    // Visibility for CheckState flush (not managed by EventListenerManager)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.checkStateManager.flushPendingCheckStateResponses();
        }
      });
    }

    // WebSocket messages
    this.listen<InternalServiceResponse>('websocket-message', (response) => {
      void this.messageHandler.handleWebSocketMessage(response);
    });

    // P2P connection changes
    this.listen<{ peerCid: bigint }>('p2p-connection-established', ({ peerCid }) => {
      this.conversationManager.setConnection(peerCid, true);
      this.connectionListeners.forEach(listener => listener(peerCid, true));
      this.checkStateManager.markPeerReady(peerCid);
      this.updatePeerPresenceOnConnect(peerCid);
    });

    this.listen<{ peerCid: bigint }>('p2p-connection-lost', ({ peerCid }) => {
      this.conversationManager.setConnection(peerCid, false);
      this.connectionListeners.forEach(listener => listener(peerCid, false));
      this.checkStateManager.clearPeerReadyState(peerCid);
      this.updatePeerPresenceOnDisconnect(peerCid);
    });

    // Peer registration
    this.listen<{ peer: { cid: bigint; username: string } }>('p2p:peer-registered', ({ peer }) => {
      if (peer.cid && peer.username) {
        this.conversationManager.setPeerUsername(peer.cid, peer.username);
      }
    });
  }

  private async loadCachedMessages(): Promise<void> {
    await this.conversationManager.loadFromStorage();
    this.cachedMessagesLoaded = true;
  }

  private async getCurrentCid(): Promise<bigint | null> {
    const instanceCid = instanceManager.cid;
    if (instanceCid) return instanceCid;

    try {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 500));
      const tabSelection = await Promise.race([getSelectedUser(), timeout]);
      if (tabSelection?.selectedCid) return tabSelection.selectedCid;
    } catch { /* continue */ }

    try {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 500));
      const tabSession = await Promise.race([connectionManager.getTabSelectedSession(), timeout]);
      if (tabSession?.cid) return tabSession.cid;
    } catch { /* continue */ }

    const connectionInfo = connectionManager.getConnectionInfo();
    return connectionInfo?.cid ?? null;
  }

  private updatePeerPresenceOnConnect(peerCid: bigint): void {
    const conversation = this.conversationManager.getConversation(peerCid);
    if (conversation) {
      const newPresence = { status: MessagingLayerType.Online as const, lastUpdate: Date.now() };
      conversation.presence = newPresence;
      this.presenceManager.notifyPresenceChange(peerCid, newPresence);
      this.emit('p2p:presence-updated', { peerCid: peerCid.toString(), presence: newPresence });
    }
    void this.presenceManager.broadcastOnlineToNewPeer(peerCid);
  }

  private updatePeerPresenceOnDisconnect(peerCid: bigint): void {
    const conversation = this.conversationManager.getConversation(peerCid);
    if (conversation) {
      const newPresence = { status: MessagingLayerType.Offline as const, lastUpdate: Date.now() };
      conversation.presence = newPresence;
      this.presenceManager.notifyPresenceChange(peerCid, newPresence);
      this.emit('p2p:presence-updated', { peerCid: peerCid.toString(), presence: newPresence });
    }
  }

  // ===== Public API: Messaging =====

  public async sendMessage(recipientCid: bigint, content: string, options?: {
    replyTo?: string; mentions?: string[]; attachments?: unknown[];
    messageType?: MessageType; documentId?: string; documentTitle?: string;
  }): Promise<P2PMessage> {
    return this.messageSender.sendMessage(recipientCid, content, options);
  }

  public async resendMessage(peerCid: bigint, messageId: string): Promise<void> {
    const conversation = this.conversationManager.getConversation(peerCid);
    if (!conversation) throw new Error(`Conversation with ${peerCid} not found`);
    return this.messageSender.resendMessage(peerCid, messageId, conversation);
  }

  public async sendRawMessage(recipientCid: bigint, layer: MessagingLayer): Promise<void> {
    return this.messageSender.sendRawMessage(recipientCid, layer);
  }

  public async markMessagesAsRead(peerCid: bigint, messageIds?: string[]): Promise<void> {
    const conversation = this.conversationManager.getConversation(peerCid);
    if (!conversation) return;

    const messagesToMark = messageIds
      ? conversation.messages.filter(m => messageIds.includes(m.id))
      : conversation.messages.filter(m => m.senderCid === peerCid && m.status === 'delivered');

    const markedMessageIds: string[] = [];
    for (const message of messagesToMark) {
      if (message.status === 'delivered') {
        message.status = 'read';
        markedMessageIds.push(message.id);
        await this.messageSender.sendMessageAck(message.id, 'read', peerCid);
      }
    }

    const newUnreadCount = conversation.messages.filter(m => m.senderCid === peerCid && m.status === 'delivered').length;
    conversation.unreadCount = newUnreadCount;

    await Promise.all([
      ...markedMessageIds.map(msgId => messagePaginationStore.updateMessageInPages(peerCid, msgId, { status: 'read' })),
      messagePaginationStore.updateUnreadCount(peerCid, newUnreadCount)
    ]);

    this.emit('conversation-updated', { peerCid, conversation });
  }

  // ===== Public API: Presence =====

  public async sendPresenceUpdate(recipientCid: bigint, presence: MessagingLayer): Promise<void> {
    return this.presenceManager.sendPresenceUpdate(recipientCid, presence);
  }

  public async broadcastPresence(presence: MessagingLayer): Promise<void> {
    return this.presenceManager.broadcastPresence(presence);
  }

  public getOwnPresence(): PeerPresence { return this.presenceManager.getOwnPresence(); }
  public startTypingPolling(recipientCid: bigint, getCurrentText: () => string): void { this.presenceManager.startTypingPolling(recipientCid, getCurrentText); }
  public stopTypingPolling(recipientCid: bigint): void { this.presenceManager.stopTypingPolling(recipientCid); }

  // ===== Public API: Conversations =====

  public getConversation(peerCid: bigint): P2PConversation | undefined { return this.conversationManager.getConversation(peerCid); }
  public getAllConversations(): P2PConversation[] { return this.conversationManager.getAllConversations(); }
  public getRecentMessages(limit: number = 50): P2PMessage[] { return this.conversationManager.getRecentMessages(limit); }
  public isConnected(peerCid: bigint): boolean { return this.conversationManager.isConnected(peerCid); }
  public setPeerUsername(peerCid: bigint, username: string): void { this.conversationManager.setPeerUsername(peerCid, username); }
  public async cleanupStaleConversations(validPeerCids: Set<bigint>): Promise<number> { return this.conversationManager.cleanupStaleConversations(validPeerCids); }
  public async loadMessagePage(peerCid: bigint, pageNumber: number) { return messagePaginationStore.loadMessagePage(peerCid, pageNumber); }
  public async loadLatestMessages(peerCid: bigint): Promise<P2PMessage[]> { return messagePaginationStore.loadLatestMessages(peerCid); }
  public async getConversationMetadata(peerCid: bigint) { return messagePaginationStore.loadMetadata(peerCid); }

  // ===== Public API: Event Listeners =====

  public onMessage(listener: (message: P2PMessage) => void): () => void {
    this.messageListeners.push(listener);
    return () => { this.messageListeners = this.messageListeners.filter(l => l !== listener); };
  }

  public onMessageStatusChange(listener: (messageId: string, status: P2PMessage['status']) => void): () => void {
    this.messageStatusListeners.push(listener);
    return () => { this.messageStatusListeners = this.messageStatusListeners.filter(l => l !== listener); };
  }

  public onTyping(listener: (peerCid: bigint, isTyping: boolean) => void): () => void { return this.presenceManager.onTyping(listener); }
  public onConnectionChange(listener: (peerCid: bigint, connected: boolean) => void): () => void {
    this.connectionListeners.push(listener);
    return () => { this.connectionListeners = this.connectionListeners.filter(l => l !== listener); };
  }
  public onPresenceChange(listener: (peerCid: bigint, presence: PeerPresence) => void): () => void { return this.presenceManager.onPresenceChange(listener); }
  public setActiveConversation(peerCid: bigint | null): void { this.activeConversationPeerCid = peerCid; }

  // ===== Compatibility Methods =====

  public async syncConnectionsFromBackend(): Promise<void> {
    try {
      const activeSessions = await connectionManager.getActiveSessions();
      const currentCid = await this.getCurrentCid();
      if (!currentCid) return;
      const mySession = activeSessions.find(s => s.cid === currentCid);
      if (!mySession?.peer_connections) return;
      for (const peerCidStr of Object.keys(mySession.peer_connections)) {
        const peerCid = BigInt(peerCidStr);
        if (!this.conversationManager.isConnected(peerCid)) {
          this.conversationManager.setConnection(peerCid, true);
          this.updatePeerPresenceOnConnect(peerCid);
        }
      }
      for (const peerCid of await p2pAutoConnectService.getConnectedPeers()) {
        if (!this.conversationManager.isConnected(peerCid)) {
          this.conversationManager.setConnection(peerCid, true);
          this.updatePeerPresenceOnConnect(peerCid);
        }
      }
    } catch (error) {
      console.warn('[P2P] syncConnectionsFromBackend: Failed to sync connections:', error);
    }
  }

  public ensurePeerReady(peerCid: bigint): Promise<void> { return this.checkStateManager.ensurePeerReady(peerCid); }
  public isPeerReady(peerCid: bigint): boolean { return this.checkStateManager.isPeerReady(peerCid); }
  public clearPeerReadyState(peerCid: bigint): void { this.checkStateManager.clearPeerReadyState(peerCid); }

  public updateFileTransferState(peerCid: bigint, transferId: string, updates: { transfer_state?: P2PMessage['transfer_state']; transfer_progress?: number }): void {
    const conversation = this.conversationManager.getConversation(peerCid);
    if (!conversation) return;
    const message = conversation.messages.find(m => m.transfer_id === transferId);
    if (!message) return;
    if (updates.transfer_state !== undefined) message.transfer_state = updates.transfer_state;
    if (updates.transfer_progress !== undefined) message.transfer_progress = updates.transfer_progress;
    this.emit('p2p:message-updated', message);
  }

  public markAsRead(peerCid: bigint): void { void this.markMessagesAsRead(peerCid); }
  public async updateUnreadCount(peerCid: bigint, unreadCount: number): Promise<void> {
    const conversation = this.conversationManager.getConversation(peerCid);
    if (conversation) conversation.unreadCount = unreadCount;
    await messagePaginationStore.updateUnreadCount(peerCid, unreadCount);
  }

  public async autoRegisterPeer(peerCid: bigint): Promise<void> {
    const currentCid = await this.getCurrentCid();
    if (!currentCid) throw new Error('Not connected to server');
    await this.autoRegisterPeerWithCid(peerCid, currentCid);
  }

  public async autoRegisterPeerWithCid(peerCid: bigint, ownCid: bigint | null | undefined): Promise<void> {
    if (!ownCid) throw new Error('No CID provided for registration');
    const request = {
      PeerRegister: {
        request_id: crypto.randomUUID(), cid: ownCid.toString(), peer_cid: peerCid.toString(),
        session_security_settings: {
          security_level: 'Standard', secrecy_mode: 'BestEffort',
          crypto_params: { encryption_algorithm: 'AES_GCM_256', kem_algorithm: 'Kyber', sig_algorithm: 'None' },
          header_obfuscator_settings: 'Disabled'
        },
        connect_after_register: false, peer_session_password: null
      }
    };
    await websocketService.sendMessage(request);
    this.emit('p2p:peer-registered', {
      peer: { cid: peerCid, username: `User ${peerCid.toString().slice(0, 8)}`, fullName: `User ${peerCid.toString().slice(0, 8)}`, isOnline: true, isRegistered: true }
    });
  }
}

export const p2pMessengerManager = P2PMessengerManager.getInstance();
