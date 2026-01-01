/**
 * Group Messaging Manager
 *
 * Manages group chat message state and handles incoming message notifications.
 * Provides a reactive interface for UI components to subscribe to message updates.
 */

import { GroupMessage, GroupMessageType } from '@/types/workspace-entities';
import { TypedEventEmitter } from './event-emitter';

export interface GroupMessageEvent {
  type: 'new_message' | 'message_edited' | 'message_deleted' | 'messages_loaded';
  groupId: string;
  message?: GroupMessage;
  messages?: GroupMessage[];
  messageId?: string;
  hasMore?: boolean;
}

export interface GroupMessagesState {
  messages: GroupMessage[];
  hasMore: boolean;
  loading: boolean;
  error?: string;
}

/**
 * Group Messaging Manager class
 * Singleton that manages all group chat state and events
 */
class GroupMessagingManagerClass {
  private static instance: GroupMessagingManagerClass;
  private eventEmitter: TypedEventEmitter<GroupMessageEvent>;
  private groupMessages: Map<string, GroupMessagesState>;

  private constructor() {
    this.eventEmitter = new TypedEventEmitter<GroupMessageEvent>();
    this.groupMessages = new Map();
  }

  public static getInstance(): GroupMessagingManagerClass {
    if (!GroupMessagingManagerClass.instance) {
      GroupMessagingManagerClass.instance = new GroupMessagingManagerClass();
    }
    return GroupMessagingManagerClass.instance;
  }

  /**
   * Get the current messages for a group
   */
  public getMessages(groupId: string): GroupMessagesState {
    return this.groupMessages.get(groupId) || {
      messages: [],
      hasMore: true,
      loading: false
    };
  }

  /**
   * Set loading state for a group
   */
  public setLoading(groupId: string, loading: boolean): void {
    const current = this.getMessages(groupId);
    this.groupMessages.set(groupId, { ...current, loading });
  }

  /**
   * Set error state for a group
   */
  public setError(groupId: string, error: string): void {
    const current = this.getMessages(groupId);
    this.groupMessages.set(groupId, { ...current, error, loading: false });
  }

  /**
   * Handle new message notification from server
   */
  public handleNewMessage(groupId: string, message: GroupMessage): void {
    const current = this.getMessages(groupId);

    // Add new message to the end (newest at bottom)
    const messages = [...current.messages, message];

    this.groupMessages.set(groupId, {
      ...current,
      messages
    });

    this.eventEmitter.emit({
      type: 'new_message',
      groupId,
      message
    });
  }

  /**
   * Handle messages loaded from server (pagination)
   */
  public handleMessagesLoaded(
    groupId: string,
    messages: GroupMessage[],
    hasMore: boolean,
    prepend: boolean = false
  ): void {
    const current = this.getMessages(groupId);

    // Sort messages by timestamp (oldest first)
    const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp);

    let newMessages: GroupMessage[];
    if (prepend) {
      // Prepending older messages (pagination)
      newMessages = [...sortedMessages, ...current.messages];
    } else {
      // Initial load or replace
      newMessages = sortedMessages;
    }

    this.groupMessages.set(groupId, {
      messages: newMessages,
      hasMore,
      loading: false
    });

    this.eventEmitter.emit({
      type: 'messages_loaded',
      groupId,
      messages: newMessages,
      hasMore
    });
  }

  /**
   * Handle message edited notification
   */
  public handleMessageEdited(
    groupId: string,
    messageId: string,
    newContent: string,
    editedAt: number
  ): void {
    const current = this.getMessages(groupId);

    const messages = current.messages.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          content: newContent,
          edited_at: editedAt
        };
      }
      return msg;
    });

    this.groupMessages.set(groupId, {
      ...current,
      messages
    });

    const editedMessage = messages.find(m => m.id === messageId);
    this.eventEmitter.emit({
      type: 'message_edited',
      groupId,
      messageId,
      message: editedMessage
    });
  }

  /**
   * Handle message deleted notification
   */
  public handleMessageDeleted(groupId: string, messageId: string): void {
    const current = this.getMessages(groupId);

    const messages = current.messages.filter(msg => msg.id !== messageId);

    this.groupMessages.set(groupId, {
      ...current,
      messages
    });

    this.eventEmitter.emit({
      type: 'message_deleted',
      groupId,
      messageId
    });
  }

  /**
   * Subscribe to group message events
   */
  public subscribe(callback: (event: GroupMessageEvent) => void): () => void {
    return this.eventEmitter.subscribe(callback);
  }

  /**
   * Subscribe to events for a specific group
   */
  public subscribeToGroup(
    groupId: string,
    callback: (event: GroupMessageEvent) => void
  ): () => void {
    return this.eventEmitter.subscribe((event) => {
      if (event.groupId === groupId) {
        callback(event);
      }
    });
  }

  /**
   * Clear messages for a group
   */
  public clearGroup(groupId: string): void {
    this.groupMessages.delete(groupId);
  }

  /**
   * Clear all group messages
   */
  public clearAll(): void {
    this.groupMessages.clear();
  }

  /**
   * Get oldest timestamp for pagination
   */
  public getOldestTimestamp(groupId: string): number | undefined {
    const state = this.getMessages(groupId);
    if (state.messages.length === 0) return undefined;
    return state.messages[0].timestamp;
  }
}

export const groupMessagingManager = GroupMessagingManagerClass.getInstance();
export default groupMessagingManager;
