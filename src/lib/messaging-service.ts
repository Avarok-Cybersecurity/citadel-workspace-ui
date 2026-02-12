import { v4 as uuidv4 } from 'uuid';
import { ConnectionService } from './connection-service';
import NotificationService, { NotificationType, NotificationPriority } from './notification-service';
import { websocketService } from './websocket-service';
import { connectionManager } from './connection';
import { debugLog } from '@/lib/debug-config';

export interface MessageRequest {
  cid: string;
  peer_cid?: string;
  message: string;
  security_level: number;
}

export interface MessageResponse {
  cid: string;
  peer_cid?: string;
  request_id?: string;
}

export interface MessageError {
  cid: string;
  message: string;
  request_id?: string;
}

export interface Message {
  id: string;
  content: string;
  timestamp: number;
  senderId: string;
  recipientId: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
}

export interface MessageNotification {
  id: string;
  sender_cid: string;
  recipient_cid: string;
  content: string;
  timestamp: number;
}

export interface MessagingState {
  messages: Record<string, Message[]>;
  typing: {
    peerIds: string[];
  };
}

export class MessagingService {
  private static instance: MessagingService;
  private onMessageReceived: ((message: Message) => void) | null = null;
  private onTypingStatusChange: ((peerId: string, isTyping: boolean) => void) | null = null;
  private connectionService: ConnectionService | null = null;
  private notificationService: NotificationService;

  private constructor() {
    // Don't initialize connection service to break the circular dependency
    this.notificationService = NotificationService.getInstance();

    // Initialize event listeners for message notifications
    this.setupEventListeners();
  }

  public static getInstance(): MessagingService {
    if (!MessagingService.instance) {
      MessagingService.instance = new MessagingService();
    }
    return MessagingService.instance;
  }

  // Lazy initialize the connection service when needed
  private getConnectionService(): ConnectionService {
    if (!this.connectionService) {
      this.connectionService = ConnectionService.getInstance();
    }
    return this.connectionService;
  }

  private setupEventListeners() {
  }

  public setMessageReceivedHandler(handler: (message: Message) => void) {
    this.onMessageReceived = handler;
  }

  public setTypingStatusHandler(handler: (peerId: string, isTyping: boolean) => void) {
    this.onTypingStatusChange = handler;
  }

  public async sendMessage(recipientId: string, content: string, securityLevel: number = 0): Promise<Message> {
    // Check if the current user is connected with the recipient
    if (!this.getConnectionService().canMessageUser(recipientId)) {
      throw new Error('Cannot send message to this user. Connection not established.');
    }

    // Create a pending message
    const messageId = uuidv4();
    const timestamp = Date.now();

    const pendingMessage: Message = {
      id: messageId,
      content,
      timestamp,
      senderId: 'current-user', // This should be the actual user ID in a real implementation
      recipientId,
      status: 'pending'
    };

    try {
      const cid = connectionManager.getConnectionInfo()?.cid;

      if (!cid) {
        throw new Error('Not connected to workspace');
      }

      // Send P2P message using websocketService
      await websocketService.sendP2PMessage(cid, BigInt(recipientId), content);

      // Update message status
      const sentMessage: Message = {
        ...pendingMessage,
        status: 'sent',
        id: messageId
      };

      return sentMessage;
    } catch (error: unknown) {
      console.error('Error sending message:', error);

      // Show error notification
      this.notificationService.addSystemNotification(
        'Message Failed',
        `Failed to send message to recipient: ${error instanceof Error ? error.message : 'Unknown error'}`,
        NotificationPriority.HIGH
      );

      // Update message with error status
      const failedMessage: Message = {
        ...pendingMessage,
        status: 'failed',
        error: (error instanceof Error ? error.message : String(error)) || 'Failed to send message'
      };

      return failedMessage;
    }
  }

  public async resendMessage(message: Message): Promise<Message> {
    // Only allow resending failed messages
    if (message.status !== 'failed') {
      return message;
    }

    try {
      // Reset message status to pending
      const pendingMessage: Message = {
        ...message,
        status: 'pending',
        timestamp: Date.now() // Update timestamp for resent message
      };

      // Attempt to send the message again
      return await this.sendMessage(message.recipientId, message.content);
    } catch (error) {
      console.error('Error resending message:', error);
      return {
        ...message,
        error: 'Failed to resend message'
      };
    }
  }

  public async sendTypingIndicator(recipientId: string, isTyping: boolean): Promise<void> {
    try {
      // For now, just log this action
      debugLog('MessagingService', `Sending typing indicator to ${recipientId}: ${isTyping ? 'typing' : 'stopped typing'}`);
    } catch (error) {
      console.error('Error sending typing indicator:', error);
    }
  }

  // Helper method to simulate receiving a message (for development/testing)
  public simulateMessageReceived(senderId: string, content: string): void {
    if (this.onMessageReceived) {
      const message: Message = {
        id: uuidv4(),
        content,
        timestamp: Date.now(),
        senderId,
        recipientId: 'current-user', // This should be the actual user ID
        status: 'delivered'
      };

      // Create a notification for the received message
      this.notificationService.addMessageNotification(
        `New message from ${senderId}`,
        content.length > 50 ? `${content.substring(0, 50)}...` : content,
        senderId,
        message.id,
        undefined, // recipientCid - not available in this legacy code path
        { message }
      );

      this.onMessageReceived(message);
    }
  }

  // Helper method to simulate typing indicator (for development/testing)
  public simulateTypingIndicator(peerId: string, isTyping: boolean): void {
    if (this.onTypingStatusChange) {
      this.onTypingStatusChange(peerId, isTyping);
    }
  }

  // Clean up event listeners
  public cleanup(): void {
    // Remove any event listeners
    this.onMessageReceived = null;
    this.onTypingStatusChange = null;
  }
}
