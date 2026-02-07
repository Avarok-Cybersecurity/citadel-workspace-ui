/**
 * Conversation Manager
 *
 * Manages P2P conversation state in memory and coordinates with storage.
 */

import { MessagingLayerType } from '@/types/messaging-layer';
import { p2pAutoConnectService } from '../p2p-auto-connect-service';
import { eventEmitter } from '../event-emitter';
import type { P2PMessage, P2PConversation, MessageCache } from './p2p-types';
import { messagePaginationStore } from './message-pagination-store';

export interface ConversationManagerConfig {
  /** Function to get current CID */
  getCurrentCid: () => Promise<bigint | null>;
  /** Max messages to keep in memory per conversation */
  maxMessagesPerConversation: number;
  /** Max messages in global queue */
  maxQueueSize: number;
}

export class ConversationManager {
  private readonly cache: MessageCache;
  private readonly connections: Map<bigint, boolean> = new Map();
  private readonly config: ConversationManagerConfig;

  constructor(config: ConversationManagerConfig) {
    this.config = config;
    this.cache = {
      conversations: new Map(),
      messageQueue: [],
      maxQueueSize: config.maxQueueSize,
      maxMessagesPerConversation: config.maxMessagesPerConversation
    };
  }

  public getConversationsMap(): Map<bigint, P2PConversation> {
    return this.cache.conversations;
  }

  public getConnections(): Map<bigint, boolean> {
    return this.connections;
  }

  public setConnection(peerCid: bigint, connected: boolean): void {
    this.connections.set(peerCid, connected);
  }

  public isConnected(peerCid: bigint): boolean {
    return this.connections.get(peerCid) || false;
  }

  public getOrCreateConversation(peerCid: bigint, peerUsername?: string): P2PConversation {
    let conversation = this.cache.conversations.get(peerCid);
    if (!conversation) {
      const isConnectedLocal = this.connections.get(peerCid) === true;
      const isConnectedAutoConnect = p2pAutoConnectService.isPeerConnected(peerCid);
      const isOnlineRegistration = p2pAutoConnectService.isPeerOnline(peerCid);
      const isOnline = isConnectedLocal || isConnectedAutoConnect || isOnlineRegistration;

      conversation = {
        peerCid,
        peerUsername,
        messages: [],
        lastMessageIndex: 0,
        unreadCount: 0,
        typing: false,
        lastTypingUpdate: 0,
        presence: {
          status: isOnline ? MessagingLayerType.Online : MessagingLayerType.Offline,
          lastUpdate: isOnline ? Date.now() : 0
        }
      };
      this.cache.conversations.set(peerCid, conversation);
    } else if (peerUsername && !conversation.peerUsername) {
      conversation.peerUsername = peerUsername;
    }
    return conversation;
  }

  public async addMessageToConversation(peerCid: bigint, message: P2PMessage): Promise<boolean> {
    const conversation = this.getOrCreateConversation(peerCid);

    if (conversation.messages.find(m => m.id === message.id)) {
      console.log('[P2P] Duplicate message detected, skipping add:', message.id);
      return false;
    }

    conversation.messages.push(message);
    conversation.lastMessageIndex = Math.max(conversation.lastMessageIndex, message.index);
    conversation.messages.sort((a, b) => a.timestamp - b.timestamp);

    if (conversation.messages.length > this.cache.maxMessagesPerConversation) {
      conversation.messages.splice(0, conversation.messages.length - this.cache.maxMessagesPerConversation);
    }

    this.updateMessageQueue(message);
    await messagePaginationStore.appendMessageToPage(
      peerCid,
      message,
      () => this.config.getCurrentCid(),
      () => this.cache.conversations.get(peerCid)?.peerUsername
    );

    return true;
  }

  private updateMessageQueue(message: P2PMessage): void {
    this.cache.messageQueue.push(message);
    if (this.cache.messageQueue.length > this.cache.maxQueueSize) {
      this.cache.messageQueue.splice(0, this.cache.messageQueue.length - this.cache.maxQueueSize);
    }
  }

  public getConversation(peerCid: bigint): P2PConversation | undefined {
    return this.cache.conversations.get(peerCid);
  }

  public getAllConversations(): P2PConversation[] {
    return Array.from(this.cache.conversations.values());
  }

  public getRecentMessages(limit: number = 50): P2PMessage[] {
    return this.cache.messageQueue.slice(-limit);
  }

  public setPeerUsername(peerCid: bigint, username: string): void {
    const conversation = this.cache.conversations.get(peerCid);
    if (conversation) {
      conversation.peerUsername = username;
      void messagePaginationStore.updatePeerUsernameInMetadata(peerCid, username);
    }
  }

  public async cleanupStaleConversations(validPeerCids: Set<bigint>): Promise<number> {
    const staleCids: bigint[] = [];
    const currentCid = await this.config.getCurrentCid();

    for (const [peerCid] of this.cache.conversations.entries()) {
      if (currentCid && peerCid === currentCid) continue;
      if (!validPeerCids.has(peerCid)) staleCids.push(peerCid);
    }

    for (const cid of staleCids) {
      console.log(`[P2P] Removing stale conversation for peer: ${cid.toString().slice(0, 8)}...`);
      this.cache.conversations.delete(cid);
    }

    if (staleCids.length > 0) {
      console.log(`[P2P] Cleaned up ${staleCids.length} stale conversation(s)`);
      await Promise.all(staleCids.map(cid => messagePaginationStore.deleteConversationPages(cid)));
      eventEmitter.emit('p2p:conversations-cleaned');
    }

    return staleCids.length;
  }

  /**
   * Initialize conversations from persisted metadata
   */
  public async loadFromStorage(): Promise<void> {
    try {
      await messagePaginationStore.deleteOldFormat();
      const metadataList = await messagePaginationStore.loadAllMetadata();

      for (const metadata of metadataList) {
        this.cache.conversations.set(metadata.peerCid, {
          peerCid: metadata.peerCid,
          peerUsername: metadata.peerUsername,
          messages: [],
          lastMessageIndex: metadata.lastMessageIndex,
          unreadCount: metadata.unreadCount,
          typing: false,
          lastTypingUpdate: 0,
          presence: { status: MessagingLayerType.Offline, lastUpdate: 0 }
        });
      }
    } catch (error) {
      console.error('Failed to load cached messages:', error);
    }
  }
}
