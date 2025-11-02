import { 
  P2PCommand, 
  P2PCommandType, 
  P2PMessagePayload, 
  P2PMessageAckPayload,
  createMessageCommand,
  createMessageAckCommand,
  createTypingIndicatorCommand,
  serializeP2PCommand,
  deserializeP2PCommand,
  decodeMessageContents,
  isMessagePayload,
  isMessageAckPayload,
  isTypingIndicatorPayload
} from '@/types/p2p-types';
import { websocketService } from './websocket-service';
import { eventEmitter } from './event-emitter';
import { p2pRegistrationService } from './p2p-registration-service';
import { connectionManager } from './connection-manager';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';

export interface P2PMessage {
  id: string;
  content: string;
  senderCid: string;
  recipientCid: string;
  timestamp: number;
  index: number;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
  replyTo?: string;
  mentions?: string[];
  attachments?: any[];
}

export interface P2PConversation {
  peerCid: string;
  messages: P2PMessage[];
  lastMessageIndex: number;
  unreadCount: number;
  typing: boolean;
  lastTypingUpdate: number;
}

interface MessageCache {
  conversations: Map<string, P2PConversation>;
  messageQueue: P2PMessage[];
  maxQueueSize: number;
  maxMessagesPerConversation: number;
}

export class P2PMessengerManager {
  private static instance: P2PMessengerManager;
  private cache: MessageCache;
  private dbPrefix = 'p2p_messages';
  private connections: Map<string, boolean> = new Map(); // peerCid -> isConnected
  private messageListeners: ((message: P2PMessage) => void)[] = [];
  private typingListeners: ((peerCid: string, isTyping: boolean) => void)[] = [];
  private connectionListeners: ((peerCid: string, connected: boolean) => void)[] = [];

  private constructor() {
    this.cache = {
      conversations: new Map(),
      messageQueue: [],
      maxQueueSize: 100,
      maxMessagesPerConversation: 100
    };

    this.setupEventListeners();
    this.loadCachedMessages();
  }

  public static getInstance(): P2PMessengerManager {
    if (!P2PMessengerManager.instance) {
      P2PMessengerManager.instance = new P2PMessengerManager();
    }
    return P2PMessengerManager.instance;
  }

  private getCurrentCid(): string | null {
    const connectionInfo = connectionManager.getConnectionInfo();
    return connectionInfo?.cid || null;
  }

  private setupEventListeners() {
    // Listen for P2P responses from the WebSocket service
    eventEmitter.on('websocket-message', this.handleWebSocketMessage.bind(this));
    
    // Listen for connection changes
    eventEmitter.on('p2p-connection-established', ({ peerCid }: { peerCid: string }) => {
      this.connections.set(peerCid, true);
      this.connectionListeners.forEach(listener => listener(peerCid, true));
    });

    eventEmitter.on('p2p-connection-lost', ({ peerCid }: { peerCid: string }) => {
      this.connections.set(peerCid, false);
      this.connectionListeners.forEach(listener => listener(peerCid, false));
    });
  }

  private async handleWebSocketMessage(response: InternalServiceResponse) {
    // Handle P2P message responses
    if ('PeerMessage' in response) {
      const { peer_cid, message } = response.PeerMessage;
      try {
        const command = deserializeP2PCommand(message);
        await this.handleP2PCommand(command, peer_cid);
      } catch (error) {
        console.error('Failed to deserialize P2P command:', error);
      }
    }
  }

  private async handleP2PCommand(command: P2PCommand, peerCid: string) {
    switch (command.type) {
      case P2PCommandType.Message:
        if (isMessagePayload(command.payload)) {
          await this.handleIncomingMessage(command.payload, peerCid);
        }
        break;
      
      case P2PCommandType.MessageAck:
        if (isMessageAckPayload(command.payload)) {
          await this.handleMessageAck(command.payload);
        }
        break;
      
      case P2PCommandType.TypingIndicator:
        if (isTypingIndicatorPayload(command.payload)) {
          this.handleTypingIndicator(command.payload);
        }
        break;
    }
  }

  private async handleIncomingMessage(payload: P2PMessagePayload, peerCid: string) {
    const message: P2PMessage = {
      id: payload.metadata.message_id,
      content: decodeMessageContents(payload.message_contents),
      senderCid: payload.metadata.sender_cid,
      recipientCid: payload.metadata.recipient_cid,
      timestamp: payload.metadata.timestamp,
      index: payload.index,
      status: 'delivered',
      replyTo: payload.metadata.reply_to,
      mentions: payload.metadata.mentions,
      attachments: payload.metadata.attachments
    };

    // Add to conversation
    await this.addMessageToConversation(peerCid, message);

    // Send delivery acknowledgment
    await this.sendMessageAck(message.id, 'delivered', peerCid);

    // Notify listeners
    this.messageListeners.forEach(listener => listener(message));
  }

  private async handleMessageAck(payload: P2PMessageAckPayload) {
    // Update message status in all conversations
    this.cache.conversations.forEach(conversation => {
      const message = conversation.messages.find(m => m.id === payload.message_id);
      if (message) {
        message.status = payload.ack_type === 'failed' ? 'failed' : payload.ack_type;
        if (payload.error) {
          message.error = payload.error;
        }
      }
    });

    // Persist the update
    await this.persistConversations();
  }

  private handleTypingIndicator(payload: any) {
    const conversation = this.cache.conversations.get(payload.sender_cid);
    if (conversation) {
      conversation.typing = payload.is_typing;
      conversation.lastTypingUpdate = payload.timestamp;
    }

    this.typingListeners.forEach(listener => 
      listener(payload.sender_cid, payload.is_typing)
    );

    // Clear typing indicator after 3 seconds
    if (payload.is_typing) {
      setTimeout(() => {
        const conv = this.cache.conversations.get(payload.sender_cid);
        if (conv && conv.lastTypingUpdate === payload.timestamp) {
          conv.typing = false;
          this.typingListeners.forEach(listener => 
            listener(payload.sender_cid, false)
          );
        }
      }, 3000);
    }
  }

  public async sendMessage(
    recipientCid: string, 
    content: string,
    replyTo?: string,
    mentions?: string[],
    attachments?: any[]
  ): Promise<P2PMessage> {
    // Check if peer is registered, if not, register them first
    if (!p2pRegistrationService.isPeerRegistered(recipientCid)) {
      console.log(`Peer ${recipientCid} not registered, registering now...`);
      try {
        await p2pRegistrationService.registerPeer(recipientCid, {
          connectAfterRegister: true
        });
        console.log(`Successfully registered peer ${recipientCid}`);
      } catch (error) {
        console.error(`Failed to register peer ${recipientCid}:`, error);
        throw new Error(`Failed to register peer for P2P communication: ${error}`);
      }
    }
    
    const conversation = this.getOrCreateConversation(recipientCid);
    const index = conversation.lastMessageIndex + 1;
    
    // Get current CID from connection
    const currentCid = this.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }

    const command = createMessageCommand(
      content,
      currentCid,
      recipientCid,
      index,
      replyTo,
      mentions,
      attachments
    );

    const message: P2PMessage = {
      id: (command.payload as P2PMessagePayload).metadata.message_id,
      content,
      senderCid: currentCid,
      recipientCid,
      timestamp: Date.now(),
      index,
      status: 'pending',
      replyTo,
      mentions,
      attachments
    };

    // Add to conversation optimistically
    await this.addMessageToConversation(recipientCid, message);

    // Send via P2P connection
    try {
      await this.sendP2PCommand(recipientCid, command);
      message.status = 'sent';
    } catch (error) {
      message.status = 'failed';
      message.error = error instanceof Error ? error.message : 'Failed to send';
      throw error;
    }

    return message;
  }

  public async sendTypingIndicator(recipientCid: string, isTyping: boolean) {
    const currentCid = this.getCurrentCid();
    if (!currentCid) return;

    const command = createTypingIndicatorCommand(isTyping, currentCid);
    await this.sendP2PCommand(recipientCid, command);
  }

  public async markMessagesAsRead(peerCid: string, messageIds?: string[]) {
    const conversation = this.cache.conversations.get(peerCid);
    if (!conversation) return;

    // If no specific messageIds provided, mark all unread messages as read
    const messagesToMark = messageIds 
      ? conversation.messages.filter(m => messageIds.includes(m.id))
      : conversation.messages.filter(m => m.senderCid === peerCid && m.status === 'delivered');

    // Send read acknowledgments for each message
    for (const message of messagesToMark) {
      if (message.status === 'delivered') {
        message.status = 'read';
        await this.sendMessageAck(message.id, 'read', peerCid);
      }
    }

    // Update unread count
    conversation.unreadCount = conversation.messages.filter(
      m => m.senderCid === peerCid && m.status === 'delivered'
    ).length;

    // Persist changes
    await this.persistConversations();

    // Emit update event
    this.eventEmitter.emit('conversation-updated', { peerCid, conversation });
  }

  private async sendMessageAck(messageId: string, ackType: "delivered" | "read" | "failed", peerCid: string) {
    const command = createMessageAckCommand(messageId, ackType);
    await this.sendP2PCommand(peerCid, command);
  }

  private async sendP2PCommand(peerCid: string, command: P2PCommand) {
    // Check if connection exists
    if (!this.connections.get(peerCid)) {
      // Try to open P2P connection first
      await this.openP2PConnection(peerCid);
    }

    const currentCid = this.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }

    const serialized = serializeP2PCommand(command);
    await websocketService.sendP2PMessage(currentCid, peerCid, serialized);
  }

  private async openP2PConnection(peerCid: string): Promise<void> {
    const currentCid = this.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }

    try {
      await websocketService.openP2PConnection(currentCid, peerCid);
      this.connections.set(peerCid, true);
    } catch (error) {
      console.error('Failed to open P2P connection:', error);
      throw error;
    }
  }

  private getOrCreateConversation(peerCid: string): P2PConversation {
    let conversation = this.cache.conversations.get(peerCid);
    if (!conversation) {
      conversation = {
        peerCid,
        messages: [],
        lastMessageIndex: 0,
        unreadCount: 0,
        typing: false,
        lastTypingUpdate: 0
      };
      this.cache.conversations.set(peerCid, conversation);
    }
    return conversation;
  }

  private async addMessageToConversation(peerCid: string, message: P2PMessage) {
    const conversation = this.getOrCreateConversation(peerCid);
    
    // Add message if not already present
    if (!conversation.messages.find(m => m.id === message.id)) {
      conversation.messages.push(message);
      conversation.lastMessageIndex = Math.max(conversation.lastMessageIndex, message.index);
      
      // Sort messages by index
      conversation.messages.sort((a, b) => a.index - b.index);
      
      // Trim to max size
      if (conversation.messages.length > this.cache.maxMessagesPerConversation) {
        const overflow = conversation.messages.splice(0, 
          conversation.messages.length - this.cache.maxMessagesPerConversation);
        
        // Move overflow to long-term storage
        await this.moveToLongTermStorage(peerCid, overflow);
      }
    }

    // Update queue
    this.updateMessageQueue(message);
    
    // Persist changes
    await this.persistConversations();
  }

  private updateMessageQueue(message: P2PMessage) {
    this.cache.messageQueue.push(message);
    
    if (this.cache.messageQueue.length > this.cache.maxQueueSize) {
      const overflow = this.cache.messageQueue.splice(0, 
        this.cache.messageQueue.length - this.cache.maxQueueSize);
      
      // Move to long-term storage asynchronously
      this.moveQueueToLongTermStorage(overflow);
    }
  }

  private async moveToLongTermStorage(peerCid: string, messages: P2PMessage[]) {
    // Use LocalDB to store messages
    for (const message of messages) {
      const key = `${this.dbPrefix}_${peerCid}_${message.id}`;
      const value = JSON.stringify(message);
      
      const request = {
        LocalDBSetKV: {
          request_id: crypto.randomUUID(),
          cid: 0, // Use 0 for local operations
          peer_cid: null,
          key,
          value
        }
      };
      
      await websocketService.sendRequest(request);
    }
  }

  private async moveQueueToLongTermStorage(messages: P2PMessage[]) {
    // Group by conversation
    const byConversation = new Map<string, P2PMessage[]>();
    messages.forEach(msg => {
      const peerCid = msg.senderCid === msg.recipientCid ? msg.recipientCid : 
        (msg.senderCid === this.getCurrentCid() ? msg.recipientCid : msg.senderCid);
      
      if (!byConversation.has(peerCid)) {
        byConversation.set(peerCid, []);
      }
      byConversation.get(peerCid)!.push(msg);
    });

    // Store each conversation's messages
    for (const [peerCid, msgs] of byConversation) {
      await this.moveToLongTermStorage(peerCid, msgs);
    }
  }

  private async persistConversations() {
    // Save current conversations to LocalDB
    const conversations = Array.from(this.cache.conversations.entries()).map(([peerCid, conv]) => ({
      peerCid,
      messages: conv.messages,
      lastMessageIndex: conv.lastMessageIndex,
      unreadCount: conv.unreadCount
    }));

    const request = {
      LocalDBSetKV: {
        request_id: crypto.randomUUID(),
        cid: 0,
        peer_cid: null,
        key: `${this.dbPrefix}_conversations`,
        value: JSON.stringify(conversations)
      }
    };

    await websocketService.sendRequest(request);
  }

  private async loadCachedMessages() {
    try {
      const request = {
        LocalDBGetKV: {
          request_id: crypto.randomUUID(),
          cid: 0,
          peer_cid: null,
          key: `${this.dbPrefix}_conversations`
        }
      };

      const response = await websocketService.sendRequest(request);
      
      if (response && 'LocalDBGetKVSuccess' in response && response.LocalDBGetKVSuccess.value) {
        const conversations = JSON.parse(response.LocalDBGetKVSuccess.value);
        conversations.forEach((conv: any) => {
          this.cache.conversations.set(conv.peerCid, {
            ...conv,
            typing: false,
            lastTypingUpdate: 0
          });
        });
      }
    } catch (error) {
      console.error('Failed to load cached messages:', error);
    }
  }

  // Public API methods
  public getConversation(peerCid: string): P2PConversation | undefined {
    return this.cache.conversations.get(peerCid);
  }

  public getAllConversations(): P2PConversation[] {
    return Array.from(this.cache.conversations.values());
  }

  public getRecentMessages(limit: number = 50): P2PMessage[] {
    return this.cache.messageQueue.slice(-limit);
  }

  public isConnected(peerCid: string): boolean {
    return this.connections.get(peerCid) || false;
  }

  public markAsRead(peerCid: string) {
    const conversation = this.cache.conversations.get(peerCid);
    if (conversation) {
      conversation.unreadCount = 0;
      
      // Send read receipts for unread messages
      conversation.messages
        .filter(m => m.status === 'delivered' && m.senderCid === peerCid)
        .forEach(m => this.sendMessageAck(m.id, 'read', peerCid));
    }
  }

  // Event listeners
  public onMessage(listener: (message: P2PMessage) => void) {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter(l => l !== listener);
    };
  }

  public onTyping(listener: (peerCid: string, isTyping: boolean) => void) {
    this.typingListeners.push(listener);
    return () => {
      this.typingListeners = this.typingListeners.filter(l => l !== listener);
    };
  }

  public onConnectionChange(listener: (peerCid: string, connected: boolean) => void) {
    this.connectionListeners.push(listener);
    return () => {
      this.connectionListeners = this.connectionListeners.filter(l => l !== listener);
    };
  }

  // Auto-registration support
  public async autoRegisterPeer(peerCid: string): Promise<void> {
    const currentCid = this.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }

    const request = {
      PeerRegister: {
        request_id: crypto.randomUUID(),
        cid: parseInt(currentCid),
        peer_cid: parseInt(peerCid),
        session_security_settings: {
          security_level: 'Standard',
          secrecy_mode: 'BestEffort',
          crypto_params: {
            encryption_algorithm: 'AES_GCM_256',
            kem_algorithm: 'Kyber',
            sig_algorithm: 'None'
          },
          header_obfuscator_settings: 'Disabled'
        },
        connect_after_register: true,
        peer_session_password: null
      }
    };

    await websocketService.sendRequest(request);
  }
}