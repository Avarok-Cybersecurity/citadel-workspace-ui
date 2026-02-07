/**
 * P2P Messaging Adapter
 *
 * Concrete implementation of ChatMessagingAdapter that wraps P2PMessengerManager.
 * Converts between P2P message types and the unified ChatMessage format.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                        CID LIFECYCLE - CRITICAL INFO                         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║ CID (Client ID) is a persistent 64-bit identifier assigned per account.      ║
 * ║                                                                              ║
 * ║ | Operation              | CID Behavior                                     |║
 * ║ |------------------------|--------------------------------------------------|║
 * ║ | Register (new account) | NEW CID assigned                                 |║
 * ║ | Login (credentials)    | SAME CID preserved                               |║
 * ║ | ClaimSession (orphan)  | SAME CID preserved                               |║
 * ║ | C2S disconnect+reconnect| SAME CID preserved, rekey works                 |║
 * ║ | TCP drop with orphan   | SAME CID, session persists on server             |║
 * ║                                                                              ║
 * ║ IMPORTANT: Only Register creates a new CID. All reconnection scenarios       ║
 * ║ (login, claim, TCP reconnect) preserve the original CID.                     ║
 * ║                                                                              ║
 * ║ For P2P messaging:                                                           ║
 * ║ - currentUserId (peerCid) is the CID, not username                           ║
 * ║ - Messages are routed by CID pairs (sender_cid, receiver_cid)                ║
 * ║ - On reconnect, same CID means queued messages can be delivered              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import {
  ChatMessagingAdapter,
  ChatMessage,
  ChatMessageEvent,
  SendMessageOptions,
} from './chat-messaging-adapter';
import {
  P2PMessengerManager,
  p2pMessengerManager,
} from './p2p';
import type { P2PMessage } from './p2p';
import type { MessageType } from '@/types/message-protocol';

/**
 * Converts a P2PMessage to the unified ChatMessage format
 */
function convertP2PMessageToChatMessage(
  msg: P2PMessage,
  currentUserId: bigint,
  peerName: string
): ChatMessage {
  const isOwn = msg.senderCid === currentUserId;

  return {
    id: msg.id,
    content: msg.content,
    timestamp: msg.timestamp,
    senderId: msg.senderCid.toString(), // Convert bigint to string for UI
    senderName: isOwn ? 'You' : peerName,
    isOwn,
    messageType: msg.message_type,
    status: mapP2PStatus(msg.status),

    // Optional fields
    editedAt: undefined, // P2P doesn't support editing yet
    replyToId: msg.replyTo,

    // File transfer fields
    transferId: msg.transfer_id,
    transferState: msg.transfer_state,
    transferProgress: msg.transfer_progress,
    fileName: msg.file_name,
    fileSize: msg.file_size,

    // Live document fields
    documentId: msg.document_id,
    documentTitle: msg.document_title,
  };
}

/**
 * Maps P2P message status to unified status
 */
function mapP2PStatus(
  status: P2PMessage['status']
): ChatMessage['status'] {
  switch (status) {
    case 'pending':
      return 'sending';
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
      return 'failed';
    default:
      return 'sent';
  }
}

/**
 * P2P Messaging Adapter Implementation
 */
export class P2PMessagingAdapter extends ChatMessagingAdapter {
  private manager: P2PMessengerManager;
  private _peerCid: bigint;
  private _peerName: string;
  private _currentUserId: bigint;
  private _currentUserName: string;
  private messages: ChatMessage[] = [];
  private subscribers: ((event: ChatMessageEvent) => void)[] = [];
  private unsubscribers: (() => void)[] = [];
  private _hasMoreMessages = true;
  private currentPage = 0;

  constructor(
    peerCid: bigint,
    peerName: string,
    currentUserId: bigint,
    currentUserName: string
  ) {
    super();
    this.manager = p2pMessengerManager;
    this._peerCid = peerCid;
    this._peerName = peerName;
    this._currentUserId = currentUserId;
    this._currentUserName = currentUserName;
  }

  // ===== Readonly Properties =====

  get contextId(): string {
    return this._peerCid.toString();
  }

  get displayName(): string {
    return this._peerName;
  }

  get currentUserId(): string {
    return this._currentUserId.toString();
  }

  get currentUserName(): string {
    return this._currentUserName;
  }

  // ===== Feature Support =====

  get supportsTypingIndicators(): boolean {
    return true;
  }

  get supportsPresence(): boolean {
    return true;
  }

  get supportsEdit(): boolean {
    return false; // P2P doesn't support edit yet
  }

  get supportsDelete(): boolean {
    return false; // P2P doesn't support delete yet
  }

  get supportsReply(): boolean {
    return true;
  }

  get supportsFileTransfer(): boolean {
    return true;
  }

  get supportsLiveDocuments(): boolean {
    return true;
  }

  // ===== Core Messaging Operations =====

  async sendMessage(content: string, options?: SendMessageOptions): Promise<void> {
    await this.manager.sendMessage(this._peerCid, content, {
      messageType: options?.messageType,
      replyTo: options?.replyToId,
      documentId: options?.documentId,
      documentTitle: options?.documentTitle,
    });
  }

  async loadMessages(): Promise<void> {
    await this.manager.waitForReady();

    // Load latest messages from storage
    const p2pMessages = await this.manager.loadLatestMessages(this._peerCid);

    // Also get any in-memory messages
    const conversation = this.manager.getConversation(this._peerCid);
    const inMemoryMessages = conversation?.messages || [];

    // Merge and dedupe (prefer in-memory for most recent)
    const allMessages = this.mergeMessages(p2pMessages, inMemoryMessages);

    this.messages = allMessages.map((msg) =>
      convertP2PMessageToChatMessage(msg, this._currentUserId, this._peerName)
    );

    // Check if there are more pages
    const metadata = await this.manager.getConversationMetadata(this._peerCid);
    this._hasMoreMessages = metadata ? metadata.latestPage > 0 : false;
    this.currentPage = metadata?.latestPage || 0;

    // Notify subscribers
    this.notifySubscribers({
      type: 'messages_loaded',
      messages: this.messages,
      hasMore: this._hasMoreMessages,
    });
  }

  async loadMoreMessages(): Promise<boolean> {
    if (this.currentPage <= 0) {
      this._hasMoreMessages = false;
      return false;
    }

    this.currentPage--;
    const page = await this.manager.loadMessagePage(this._peerCid, this.currentPage);

    if (!page || page.messages.length === 0) {
      this._hasMoreMessages = false;
      return false;
    }

    // Convert and prepend older messages
    const olderMessages = page.messages.map((msg) =>
      convertP2PMessageToChatMessage(msg, this._currentUserId, this._peerName)
    );

    this.messages = [...olderMessages, ...this.messages];
    this._hasMoreMessages = this.currentPage > 0;

    this.notifySubscribers({
      type: 'messages_loaded',
      messages: this.messages,
      hasMore: this._hasMoreMessages,
    });

    return this._hasMoreMessages;
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  hasMoreMessages(): boolean {
    return this._hasMoreMessages;
  }

  // ===== Message Actions =====

  async editMessage(_messageId: string, _newContent: string): Promise<void> {
    // P2P doesn't support editing yet
    throw new Error('P2P messaging does not support message editing');
  }

  async deleteMessage(_messageId: string): Promise<void> {
    // P2P doesn't support deletion yet
    throw new Error('P2P messaging does not support message deletion');
  }

  async replyToMessage(messageId: string, content: string): Promise<void> {
    await this.manager.sendMessage(this._peerCid, content, {
      replyTo: messageId,
    });
  }

  async markAsRead(): Promise<void> {
    await this.manager.markMessagesAsRead(this._peerCid);
  }

  // ===== Typing Indicators =====

  startTyping(): void {
    // P2P uses polling-based typing - we just need to start the polling
    // The actual implementation in P2PChat handles the getCurrentText callback
    // For the adapter, we'll emit a typing event
    this.notifySubscribers({
      type: 'typing_started',
      senderId: this._currentUserId.toString(),
      isTyping: true,
    });
  }

  stopTyping(): void {
    this.notifySubscribers({
      type: 'typing_stopped',
      senderId: this._currentUserId.toString(),
      isTyping: false,
    });
  }

  // ===== Event Subscription =====

  subscribe(callback: (event: ChatMessageEvent) => void): () => void {
    this.subscribers.push(callback);

    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== callback);
    };
  }

  // ===== Lifecycle =====

  async initialize(): Promise<void> {
    await this.manager.waitForReady();
    await this.manager.syncConnectionsFromBackend();

    // Set up listeners for P2P events
    const unsubMessage = this.manager.onMessage((msg) => {
      // Only process messages for this conversation
      if (msg.senderCid !== this._peerCid && msg.recipientCid !== this._peerCid) {
        return;
      }

      const chatMessage = convertP2PMessageToChatMessage(
        msg,
        this._currentUserId,
        this._peerName
      );

      // Add to local cache if not already present
      if (!this.messages.find((m) => m.id === chatMessage.id)) {
        this.messages.push(chatMessage);
        this.messages.sort((a, b) => a.timestamp - b.timestamp);
      }

      this.notifySubscribers({
        type: msg.senderCid === this._currentUserId ? 'message_sent' : 'message_received',
        message: chatMessage,
      });
    });
    this.unsubscribers.push(unsubMessage);

    const unsubStatus = this.manager.onMessageStatusChange((messageId, status) => {
      const message = this.messages.find((m) => m.id === messageId);
      if (message) {
        message.status = mapP2PStatus(status);
        this.notifySubscribers({
          type: 'message_updated',
          message,
        });
      }
    });
    this.unsubscribers.push(unsubStatus);

    const unsubTyping = this.manager.onTyping((peerCid, isTyping) => {
      if (peerCid === this._peerCid) {
        this.notifySubscribers({
          type: isTyping ? 'typing_started' : 'typing_stopped',
          senderId: peerCid.toString(),
          isTyping,
        });
      }
    });
    this.unsubscribers.push(unsubTyping);

    const unsubPresence = this.manager.onPresenceChange((peerCid, presence) => {
      if (peerCid === this._peerCid) {
        const isOnline = presence.status !== 'Offline'; // Check for Offline status
        this.notifySubscribers({
          type: 'presence_changed',
          senderId: peerCid.toString(),
          presence: isOnline ? 'online' : 'offline',
        });
      }
    });
    this.unsubscribers.push(unsubPresence);

    const unsubConnection = this.manager.onConnectionChange((peerCid, connected) => {
      if (peerCid === this._peerCid) {
        this.notifySubscribers({
          type: 'connection_changed',
          isConnected: connected,
        });
      }
    });
    this.unsubscribers.push(unsubConnection);

    // Set this as the active conversation
    this.manager.setActiveConversation(this._peerCid);
  }

  cleanup(): void {
    // Unsubscribe from all P2P events
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
    this.subscribers = [];

    // Clear active conversation
    this.manager.setActiveConversation(null);

    // Stop typing polling
    this.manager.stopTypingPolling(this._peerCid);
  }

  // ===== P2P-Specific Methods =====

  /**
   * Get the underlying P2PMessengerManager for advanced operations
   */
  getManager(): P2PMessengerManager {
    return this.manager;
  }

  /**
   * Check if peer is connected
   */
  isPeerConnected(): boolean {
    return this.manager.isConnected(this._peerCid);
  }

  /**
   * Resend a failed message
   */
  async resendMessage(messageId: string): Promise<void> {
    await this.manager.resendMessage(this._peerCid, messageId);
  }

  /**
   * Start typing indicator polling with text getter
   */
  startTypingPolling(getCurrentText: () => string): void {
    this.manager.startTypingPolling(this._peerCid, getCurrentText);
  }

  /**
   * Stop typing indicator polling
   */
  stopTypingPolling(): void {
    this.manager.stopTypingPolling(this._peerCid);
  }

  // ===== Private Helpers =====

  private notifySubscribers(event: ChatMessageEvent): void {
    this.subscribers.forEach((callback) => callback(event));
  }

  private mergeMessages(
    storageMessages: P2PMessage[],
    inMemoryMessages: P2PMessage[]
  ): P2PMessage[] {
    const messageMap = new Map<string, P2PMessage>();

    // Add storage messages first
    storageMessages.forEach((msg) => messageMap.set(msg.id, msg));

    // In-memory messages override (more recent state)
    inMemoryMessages.forEach((msg) => messageMap.set(msg.id, msg));

    // Sort by timestamp
    return Array.from(messageMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  }
}

/**
 * Factory function to create a P2P messaging adapter
 */
export function createP2PMessagingAdapter(
  peerCid: bigint,
  peerName: string,
  currentUserId: bigint,
  currentUserName: string
): P2PMessagingAdapter {
  return new P2PMessagingAdapter(peerCid, peerName, currentUserId, currentUserName);
}
