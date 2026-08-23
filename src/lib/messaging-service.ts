import { v4 as uuidv4 } from 'uuid';
import { ConnectionService } from './connection-service';
import NotificationService, { NotificationPriority } from './notification-service';
import { websocketService } from './websocket-service';
import { connectionManager } from './connection';
import { p2pMessengerManager } from './p2p';
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

  public async sendMessage(recipientId: string, content: string, _securityLevel: number = 0): Promise<Message> {
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
      senderId: String(connectionManager.getConnectionInfo()?.cid || 'current-user'),
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
      debugLog('MessagingService', 'Error sending message:', error);

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
      // Attempt to send the message again
      return await this.sendMessage(message.recipientId, message.content);
    } catch (error) {
      debugLog('MessagingService', 'Error resending message:', error);
      return {
        ...message,
        error: 'Failed to resend message'
      };
    }
  }

  public async sendTypingIndicator(recipientId: string, isTyping: boolean): Promise<void> {
    // Callers of this API (see RetryableMessageSender) already maintain their
    // own "is currently typing" state and only call us to emit a discrete
    // event. Previously this method wired into the *polling* API with a
    // `() => ''` text-getter, which caused the polling loop to never observe
    // any change and therefore never emit anything. The net effect was that
    // typing indicators silently never reached peers.
    //
    // We now fire a single typing event when isTyping flips to true, and
    // rely on the receiver-side expiry for the stop signal. If a future
    // caller needs input-bound polling, it should use startTypingPolling
    // directly with a real `getCurrentText` closure.
    try {
      if (isTyping) {
        await p2pMessengerManager.sendTypingIndicator(BigInt(recipientId));
      }
      // isTyping=false currently requires no action: typing indicators
      // expire on the receiver side. Kept explicit so future additions
      // (e.g. a "stopped typing" signal) have an obvious insertion point.
    } catch (error) {
      debugLog('MessagingService', 'Error sending typing indicator:', error);
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
        recipientId: String(connectionManager.getConnectionInfo()?.cid || 'current-user'),
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
