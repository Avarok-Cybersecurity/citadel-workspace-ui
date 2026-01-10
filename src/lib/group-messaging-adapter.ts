/**
 * Group Messaging Adapter
 *
 * Concrete implementation of ChatMessagingAdapter that wraps groupMessagingManager
 * and WorkspaceService. Converts between GroupMessage types and the unified ChatMessage format.
 */

import {
  ChatMessagingAdapter,
  ChatMessage,
  ChatMessageEvent,
  SendMessageOptions,
} from './chat-messaging-adapter';
import {
  groupMessagingManager,
  GroupMessageEvent,
} from './group-messaging-manager';
import { workspaceService } from './workspace-service';
import { GroupMessage, GroupMessageType } from '@/types/workspace-entities';
import { GroupMessageTypeTS } from '@/types/workspace-protocol';
import type { MessageType } from '@/types/message-protocol';

/**
 * Maps our MessageType to GroupMessageTypeTS for workspace protocol
 */
function mapMessageTypeToGroupMessageType(messageType: MessageType): GroupMessageTypeTS {
  switch (messageType) {
    case 'markdown':
      return GroupMessageTypeTS.Markdown;
    case 'text':
    default:
      return GroupMessageTypeTS.Text;
  }
}

/**
 * Maps GroupMessageType to our MessageType
 */
function mapGroupMessageTypeToMessageType(groupType: GroupMessageType): MessageType {
  switch (groupType) {
    case GroupMessageType.Markdown:
      return 'markdown';
    case GroupMessageType.Text:
    default:
      return 'text';
  }
}

/**
 * Converts a GroupMessage to the unified ChatMessage format
 */
function convertGroupMessageToChatMessage(
  msg: GroupMessage,
  currentUserId: string
): ChatMessage {
  const isOwn = msg.sender_id === currentUserId;

  return {
    id: msg.id,
    content: msg.content,
    timestamp: msg.timestamp,
    senderId: msg.sender_id,
    senderName: msg.sender_name,
    isOwn,
    messageType: mapGroupMessageTypeToMessageType(msg.message_type),
    status: 'sent', // Group messages are always "sent" once received

    // Optional fields
    editedAt: msg.edited_at,
    replyToId: msg.reply_to,
    replyCount: msg.reply_count,
  };
}

/**
 * Group Messaging Adapter Implementation
 */
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

  constructor(
    groupId: string,
    groupName: string,
    currentUserId: string,
    currentUserName: string
  ) {
    super();
    this._groupId = groupId;
    this._groupName = groupName;
    this._currentUserId = currentUserId;
    this._currentUserName = currentUserName;
  }

  // ===== Readonly Properties =====

  get contextId(): string {
    return this._groupId;
  }

  get displayName(): string {
    return this._groupName;
  }

  get currentUserId(): string {
    return this._currentUserId;
  }

  get currentUserName(): string {
    return this._currentUserName;
  }

  // ===== Feature Support =====

  get supportsTypingIndicators(): boolean {
    return false; // Group chat doesn't support typing indicators yet
  }

  get supportsPresence(): boolean {
    return false; // Group chat doesn't support presence yet
  }

  get supportsEdit(): boolean {
    return true; // Group chat supports editing
  }

  get supportsDelete(): boolean {
    return true; // Group chat supports deletion
  }

  get supportsReply(): boolean {
    return true; // Group chat supports threading
  }

  get supportsFileTransfer(): boolean {
    return false; // Group chat doesn't support P2P file transfer
  }

  get supportsLiveDocuments(): boolean {
    return false; // Group chat doesn't support live documents yet
  }

  // ===== Core Messaging Operations =====

  async sendMessage(content: string, options?: SendMessageOptions): Promise<void> {
    const messageType = options?.messageType
      ? mapMessageTypeToGroupMessageType(options.messageType)
      : GroupMessageTypeTS.Text;

    await workspaceService.sendGroupMessage(
      this._groupId,
      content,
      messageType,
      options?.replyToId,
      undefined // mentions - could be extracted from content
    );
  }

  async loadMessages(): Promise<void> {
    if (this._isLoading) return;
    this._isLoading = true;

    try {
      const response = await workspaceService.getGroupMessages(this._groupId);

      if (response?.GroupMessages) {
        const groupMessages: GroupMessage[] = response.GroupMessages.messages || [];
        this._hasMoreMessages = response.GroupMessages.has_more || false;

        // Update group messaging manager
        groupMessagingManager.handleMessagesLoaded(
          this._groupId,
          groupMessages,
          this._hasMoreMessages,
          false
        );

        // Convert to ChatMessage format
        this.messages = groupMessages.map((msg) =>
          convertGroupMessageToChatMessage(msg, this._currentUserId)
        );

        // Notify subscribers
        this.notifySubscribers({
          type: 'messages_loaded',
          messages: this.messages,
          hasMore: this._hasMoreMessages,
        });
      }
    } finally {
      this._isLoading = false;
    }
  }

  async loadMoreMessages(): Promise<boolean> {
    if (this._isLoading || !this._hasMoreMessages) {
      return false;
    }

    this._isLoading = true;

    try {
      // Get oldest timestamp for pagination
      const oldestTimestamp = groupMessagingManager.getOldestTimestamp(this._groupId);

      const response = await workspaceService.getGroupMessages(
        this._groupId,
        oldestTimestamp
      );

      if (response?.GroupMessages) {
        const groupMessages: GroupMessage[] = response.GroupMessages.messages || [];
        this._hasMoreMessages = response.GroupMessages.has_more || false;

        if (groupMessages.length === 0) {
          this._hasMoreMessages = false;
          return false;
        }

        // Update group messaging manager (prepend older messages)
        groupMessagingManager.handleMessagesLoaded(
          this._groupId,
          groupMessages,
          this._hasMoreMessages,
          true // prepend
        );

        // Convert and prepend to local messages
        const olderMessages = groupMessages.map((msg) =>
          convertGroupMessageToChatMessage(msg, this._currentUserId)
        );
        this.messages = [...olderMessages, ...this.messages];

        // Notify subscribers
        this.notifySubscribers({
          type: 'messages_loaded',
          messages: this.messages,
          hasMore: this._hasMoreMessages,
        });

        return this._hasMoreMessages;
      }

      return false;
    } finally {
      this._isLoading = false;
    }
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  hasMoreMessages(): boolean {
    return this._hasMoreMessages;
  }

  // ===== Message Actions =====

  async editMessage(messageId: string, newContent: string): Promise<void> {
    await workspaceService.editGroupMessage(this._groupId, messageId, newContent);
  }

  async deleteMessage(messageId: string): Promise<void> {
    await workspaceService.deleteGroupMessage(this._groupId, messageId);
  }

  async replyToMessage(messageId: string, content: string): Promise<void> {
    await workspaceService.sendGroupMessage(
      this._groupId,
      content,
      GroupMessageTypeTS.Text,
      messageId
    );
  }

  async markAsRead(): Promise<void> {
    // Group messages don't have read receipts in current implementation
    // This is a no-op for now
  }

  // ===== Typing Indicators =====

  startTyping(): void {
    // Group chat doesn't support typing indicators yet
  }

  stopTyping(): void {
    // Group chat doesn't support typing indicators yet
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
    // Subscribe to group messaging manager events
    this.unsubscriber = groupMessagingManager.subscribeToGroup(
      this._groupId,
      (event) => this.handleGroupEvent(event)
    );
  }

  cleanup(): void {
    if (this.unsubscriber) {
      this.unsubscriber();
      this.unsubscriber = null;
    }
    this.subscribers = [];

    // Clear group from manager
    groupMessagingManager.clearGroup(this._groupId);
  }

  // ===== Private Helpers =====

  private handleGroupEvent(event: GroupMessageEvent): void {
    switch (event.type) {
      case 'new_message':
        if (event.message) {
          const chatMessage = convertGroupMessageToChatMessage(
            event.message,
            this._currentUserId
          );

          // Add to local cache if not already present
          if (!this.messages.find((m) => m.id === chatMessage.id)) {
            this.messages.push(chatMessage);
            this.messages.sort((a, b) => a.timestamp - b.timestamp);
          }

          this.notifySubscribers({
            type:
              event.message.sender_id === this._currentUserId
                ? 'message_sent'
                : 'message_received',
            message: chatMessage,
          });
        }
        break;

      case 'message_edited':
        if (event.messageId && event.message) {
          const message = this.messages.find((m) => m.id === event.messageId);
          if (message) {
            message.content = event.message.content;
            message.editedAt = event.message.edited_at;

            this.notifySubscribers({
              type: 'message_updated',
              message,
            });
          }
        }
        break;

      case 'message_deleted':
        if (event.messageId) {
          this.messages = this.messages.filter((m) => m.id !== event.messageId);

          this.notifySubscribers({
            type: 'message_deleted',
            messageId: event.messageId,
          });
        }
        break;

      case 'messages_loaded':
        if (event.messages) {
          this.messages = event.messages.map((msg) =>
            convertGroupMessageToChatMessage(msg, this._currentUserId)
          );
          this._hasMoreMessages = event.hasMore || false;

          this.notifySubscribers({
            type: 'messages_loaded',
            messages: this.messages,
            hasMore: this._hasMoreMessages,
          });
        }
        break;
    }
  }

  private notifySubscribers(event: ChatMessageEvent): void {
    this.subscribers.forEach((callback) => callback(event));
  }
}

/**
 * Factory function to create a Group messaging adapter
 */
export function createGroupMessagingAdapter(
  groupId: string,
  groupName: string,
  currentUserId: string,
  currentUserName: string
): GroupMessagingAdapter {
  return new GroupMessagingAdapter(groupId, groupName, currentUserId, currentUserName);
}
