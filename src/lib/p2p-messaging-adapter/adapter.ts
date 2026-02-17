/**
 * P2P Messaging Adapter
 *
 * Concrete implementation of ChatMessagingAdapter that wraps P2PMessengerManager.
 * Converts between P2P message types and the unified ChatMessage format.
 */

import {
  ChatMessagingAdapter,
  type ChatMessage,
  type ChatMessageEvent,
  type SendMessageOptions,
} from '../chat-messaging-adapter';
import {
  P2PMessengerManager,
  p2pMessengerManager,
} from '../p2p';
import { convertP2PMessageToChatMessage, mergeMessages } from './converters';
import { initializeAdapter, cleanupAdapter } from './adapter-lifecycle';

export class P2PMessagingAdapter extends ChatMessagingAdapter {
  readonly manager: P2PMessengerManager;
  readonly peerCid: bigint;
  readonly peerName: string;
  readonly currentUserIdBigInt: bigint;
  private readonly _currentUserName: string;
  messages: ChatMessage[] = [];
  subscribers: ((event: ChatMessageEvent) => void)[] = [];
  unsubscribers: (() => void)[] = [];
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
    this.peerCid = peerCid;
    this.peerName = peerName;
    this.currentUserIdBigInt = currentUserId;
    this._currentUserName = currentUserName;
  }

  // ===== Readonly Properties =====

  get contextId(): string { return this.peerCid.toString(); }
  get displayName(): string { return this.peerName; }
  get currentUserId(): string { return this.currentUserIdBigInt.toString(); }
  get currentUserName(): string { return this._currentUserName; }

  // ===== Feature Support =====

  get supportsTypingIndicators(): boolean { return true; }
  get supportsPresence(): boolean { return true; }
  get supportsEdit(): boolean { return false; }
  get supportsDelete(): boolean { return false; }
  get supportsReply(): boolean { return true; }
  get supportsFileTransfer(): boolean { return true; }
  get supportsLiveDocuments(): boolean { return true; }

  // ===== Core Messaging Operations =====

  async sendMessage(content: string, options?: SendMessageOptions): Promise<void> {
    await this.manager.sendMessage(this.peerCid, content, {
      messageType: options?.messageType,
      replyTo: options?.replyToId,
      documentId: options?.documentId,
      documentTitle: options?.documentTitle,
    });
  }

  async loadMessages(): Promise<void> {
    await this.manager.waitForReady();

    const p2pMessages = await this.manager.loadLatestMessages(this.peerCid);
    const conversation = this.manager.getConversation(this.peerCid);
    const inMemoryMessages = conversation?.messages || [];
    const allMessages = mergeMessages(p2pMessages, inMemoryMessages);

    this.messages = allMessages.map((msg) =>
      convertP2PMessageToChatMessage(msg, this.currentUserIdBigInt, this.peerName)
    );

    const metadata = await this.manager.getConversationMetadata(this.peerCid);
    this._hasMoreMessages = metadata ? metadata.latestPage > 0 : false;
    this.currentPage = metadata?.latestPage || 0;

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
    const page = await this.manager.loadMessagePage(this.peerCid, this.currentPage);

    if (!page || page.messages.length === 0) {
      this._hasMoreMessages = false;
      return false;
    }

    const olderMessages = page.messages.map((msg) =>
      convertP2PMessageToChatMessage(msg, this.currentUserIdBigInt, this.peerName)
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

  getMessages(): ChatMessage[] { return this.messages; }
  hasMoreMessages(): boolean { return this._hasMoreMessages; }

  // ===== Message Actions =====

  async editMessage(_messageId: string, _newContent: string): Promise<void> {
    throw new Error('P2P messaging does not support message editing');
  }

  async deleteMessage(_messageId: string): Promise<void> {
    throw new Error('P2P messaging does not support message deletion');
  }

  async replyToMessage(messageId: string, content: string): Promise<void> {
    await this.manager.sendMessage(this.peerCid, content, { replyTo: messageId });
  }

  async markAsRead(): Promise<void> {
    await this.manager.markMessagesAsRead(this.peerCid);
  }

  // ===== Typing Indicators =====

  startTyping(): void {
    this.notifySubscribers({
      type: 'typing_started',
      senderId: this.currentUserIdBigInt.toString(),
      isTyping: true,
    });
  }

  stopTyping(): void {
    this.notifySubscribers({
      type: 'typing_stopped',
      senderId: this.currentUserIdBigInt.toString(),
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
    return initializeAdapter(this);
  }

  cleanup(): void {
    cleanupAdapter(this);
  }

  // ===== P2P-Specific Methods =====

  getManager(): P2PMessengerManager { return this.manager; }
  isPeerConnected(): boolean { return this.manager.isConnected(this.peerCid); }

  async resendMessage(messageId: string): Promise<void> {
    await this.manager.resendMessage(this.peerCid, messageId);
  }

  startTypingPolling(getCurrentText: () => string): void {
    this.manager.startTypingPolling(this.peerCid, getCurrentText);
  }

  stopTypingPolling(): void {
    this.manager.stopTypingPolling(this.peerCid);
  }

  // ===== Internal =====

  notifySubscribers(event: ChatMessageEvent): void {
    this.subscribers.forEach((callback) => callback(event));
  }
}
