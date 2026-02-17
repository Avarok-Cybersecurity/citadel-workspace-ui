/**
 * Group Messaging Adapter
 *
 * Concrete implementation of ChatMessagingAdapter that wraps groupMessagingManager
 * and WorkspaceService for group chat functionality.
 */
import {
  ChatMessagingAdapter, ChatMessage, ChatMessageEvent, SendMessageOptions,
} from '../chat-messaging-adapter';
import { groupMessagingManager, GroupMessageEvent } from '../group-messaging-manager';
import WorkspaceService from '../workspace-service';
import { GroupMessageTypeTS } from '@/types/workspace-protocol';
import { mapMessageTypeToGroupMessageType, convertGroupMessageToChatMessage } from './helpers';

export class GroupMessagingAdapter extends ChatMessagingAdapter {
  private _groupId: string;
  private _groupName: string;
  private _currentUserId: string;
  private _currentUserName: string;
  private messages: ChatMessage[] = [];
  private subscribers: ((event: ChatMessageEvent) => void)[] = [];
  private unsubscriber: (() => void) | null = null;
  private _hasMoreMessages = true;
  private _isLoading = false;

  constructor(groupId: string, groupName: string, currentUserId: string, currentUserName: string) {
    super();
    this._groupId = groupId;
    this._groupName = groupName;
    this._currentUserId = currentUserId;
    this._currentUserName = currentUserName;
  }

  get contextId(): string { return this._groupId; }
  get displayName(): string { return this._groupName; }
  get currentUserId(): string { return this._currentUserId; }
  get currentUserName(): string { return this._currentUserName; }
  get supportsTypingIndicators(): boolean { return false; }
  get supportsPresence(): boolean { return false; }
  get supportsEdit(): boolean { return true; }
  get supportsDelete(): boolean { return true; }
  get supportsReply(): boolean { return true; }
  get supportsFileTransfer(): boolean { return false; }
  get supportsLiveDocuments(): boolean { return false; }

  async sendMessage(content: string, options?: SendMessageOptions): Promise<void> {
    const messageType = options?.messageType
      ? mapMessageTypeToGroupMessageType(options.messageType)
      : GroupMessageTypeTS.Text;
    await WorkspaceService.sendGroupMessage(
      this._groupId, content, messageType, options?.replyToId, undefined
    );
  }

  async loadMessages(): Promise<void> {
    if (this._isLoading) return;
    this._isLoading = true;
    try {
      await WorkspaceService.getGroupMessages(this._groupId);
    } finally {
      this._isLoading = false;
    }
  }

  async loadMoreMessages(): Promise<boolean> {
    if (this._isLoading || !this._hasMoreMessages) return false;
    this._isLoading = true;
    try {
      const oldestTimestamp = groupMessagingManager.getOldestTimestamp(this._groupId);
      await WorkspaceService.getGroupMessages(this._groupId, oldestTimestamp);
      return this._hasMoreMessages;
    } finally {
      this._isLoading = false;
    }
  }

  getMessages(): ChatMessage[] { return this.messages; }
  hasMoreMessages(): boolean { return this._hasMoreMessages; }

  async editMessage(messageId: string, newContent: string): Promise<void> {
    await WorkspaceService.editGroupMessage(this._groupId, messageId, newContent);
  }

  async deleteMessage(messageId: string): Promise<void> {
    await WorkspaceService.deleteGroupMessage(this._groupId, messageId);
  }

  async replyToMessage(messageId: string, content: string): Promise<void> {
    await WorkspaceService.sendGroupMessage(
      this._groupId, content, GroupMessageTypeTS.Text, messageId
    );
  }

  async markAsRead(): Promise<void> { /* no-op: no read receipts */ }
  startTyping(): void { /* not supported */ }
  stopTyping(): void { /* not supported */ }

  subscribe(callback: (event: ChatMessageEvent) => void): () => void {
    this.subscribers.push(callback);
    return () => { this.subscribers = this.subscribers.filter((s) => s !== callback); };
  }

  async initialize(): Promise<void> {
    this.unsubscriber = groupMessagingManager.subscribeToGroup(
      this._groupId, (event) => this.handleGroupEvent(event)
    );
  }

  cleanup(): void {
    if (this.unsubscriber) { this.unsubscriber(); this.unsubscriber = null; }
    this.subscribers = [];
    groupMessagingManager.clearGroup(this._groupId);
  }

  private handleGroupEvent(event: GroupMessageEvent): void {
    switch (event.type) {
      case 'new_message':
        if (event.message) {
          const chatMessage = convertGroupMessageToChatMessage(event.message, this._currentUserId);
          if (!this.messages.find((m) => m.id === chatMessage.id)) {
            this.messages.push(chatMessage);
            this.messages.sort((a, b) => a.timestamp - b.timestamp);
          }
          this.notifySubscribers({
            type: event.message.sender_id === this._currentUserId ? 'message_sent' : 'message_received',
            message: chatMessage,
          });
        }
        break;

      case 'message_edited':
        if (event.messageId && event.message) {
          const message = this.messages.find((m) => m.id === event.messageId);
          if (message) {
            message.content = event.message.content;
            message.editedAt = event.message.edited_at != null ? Number(event.message.edited_at) : undefined;
            this.notifySubscribers({ type: 'message_updated', message });
          }
        }
        break;

      case 'message_deleted':
        if (event.messageId) {
          this.messages = this.messages.filter((m) => m.id !== event.messageId);
          this.notifySubscribers({ type: 'message_deleted', messageId: event.messageId });
        }
        break;

      case 'messages_loaded':
        if (event.messages) {
          this.messages = event.messages.map((msg) =>
            convertGroupMessageToChatMessage(msg, this._currentUserId)
          );
          this._hasMoreMessages = event.hasMore || false;
          this.notifySubscribers({
            type: 'messages_loaded', messages: this.messages, hasMore: this._hasMoreMessages,
          });
        }
        break;
    }
  }

  private notifySubscribers(event: ChatMessageEvent): void {
    this.subscribers.forEach((callback) => callback(event));
  }
}
