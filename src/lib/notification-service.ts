import { listen } from './event-emitter';
import { v4 as uuidv4 } from 'uuid';

export enum NotificationType {
  MESSAGE = 'message',
  PEER_REGISTRATION = 'peer_registration',
  SYSTEM = 'system'
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high'
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  sourceId?: string; // ID of the message, connection request, etc.
  senderId?: string; // User ID who triggered this notification
  priority: NotificationPriority;
  read: boolean;
  timestamp: number;
  actionButtons?: NotificationAction[];
  data?: Record<string, any>; // Additional data specific to the notification type
}

export interface NotificationAction {
  id: string;
  label: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  onClick: () => void;
}

type NotificationHandler = (notification: Notification) => void;

/**
 * Centralized service to manage all types of notifications in the application
 */
export class NotificationService {
  private static instance: NotificationService;
  private notifications: Map<string, Notification> = new Map();
  private notificationHandlers: Set<NotificationHandler> = new Set();
  private unlisten: (() => void) | null = null;

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private async setupEventListeners() {
    try {
      // Listen for notifications from the Rust backend
      this.unlisten = await listen('notification', (event) => {
        const notification = event.payload as Notification;
        this.addNotification(notification);
      });

      console.info('NotificationService event listeners set up');
    } catch (error) {
      console.error('Failed to set up notification listeners:', error);
    }
  }

  /**
   * Add a new notification to the system
   */
  public addNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): Notification {
    const id = uuidv4();
    const timestamp = Date.now();

    const fullNotification: Notification = {
      ...notification,
      id,
      timestamp,
      read: false
    };

    this.notifications.set(id, fullNotification);

    // Notify all handlers
    this.notifyHandlers(fullNotification);

    return fullNotification;
  }

  /**
   * Add a message notification
   */
  public addMessageNotification(title: string, content: string, senderId: string, messageId: string, data?: Record<string, any>): Notification {
    return this.addNotification({
      type: NotificationType.MESSAGE,
      title,
      content,
      senderId,
      sourceId: messageId,
      priority: NotificationPriority.NORMAL,
      data
    });
  }

  /**
   * Add a peer registration notification with inline Accept/Decline buttons
   */
  public addPeerRegistrationNotification(
    peerUsername: string,
    peerCid: string,
    requestId: string,
    onAccept: () => void,
    onDecline: () => void,
    onCardClick: () => void
  ): Notification {
    return this.addNotification({
      type: NotificationType.PEER_REGISTRATION,
      title: `${peerUsername} wants to connect`,
      content: `CID: ${peerCid.slice(0, 12)}...`,
      senderId: peerCid,
      sourceId: requestId,
      priority: NotificationPriority.HIGH,
      actionButtons: [
        { id: 'accept', label: 'Accept', variant: 'default', onClick: onAccept },
        { id: 'decline', label: 'Decline', variant: 'destructive', onClick: onDecline }
      ],
      data: { requestId, peerCid, peerUsername, onCardClick }
    });
  }

  /**
   * Add a system notification
   */
  public addSystemNotification(title: string, content: string, priority: NotificationPriority = NotificationPriority.NORMAL): Notification {
    return this.addNotification({
      type: NotificationType.SYSTEM,
      title,
      content,
      priority
    });
  }

  /**
   * Mark a notification as read
   */
  public markAsRead(notificationId: string): void {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      notification.read = true;
      this.notifications.set(notificationId, notification);
      this.notifyHandlers(notification);
    }
  }

  /**
   * Mark all notifications as read
   */
  public markAllAsRead(): void {
    for (const [id, notification] of this.notifications.entries()) {
      if (!notification.read) {
        notification.read = true;
        this.notifications.set(id, notification);
      }
    }

    // Notify handlers that all notifications have been updated
    this.notifyAllHandlers();
  }

  /**
   * Remove a notification
   */
  public removeNotification(notificationId: string): void {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      this.notifications.delete(notificationId);
      this.notifyRemovedHandler(notification);
    }
  }

  /**
   * Get all notifications
   */
  public getNotifications(): Notification[] {
    return Array.from(this.notifications.values())
      .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
  }

  /**
   * Get unread notifications
   */
  public getUnreadNotifications(): Notification[] {
    return this.getNotifications()
      .filter(notification => !notification.read);
  }

  /**
   * Get notifications by type
   */
  public getNotificationsByType(type: NotificationType): Notification[] {
    return this.getNotifications()
      .filter(notification => notification.type === type);
  }

  /**
   * Register a notification handler to be notified of new notifications
   */
  public registerNotificationHandler(handler: NotificationHandler): () => void {
    this.notificationHandlers.add(handler);

    // Return a function to unregister the handler
    return () => {
      this.notificationHandlers.delete(handler);
    };
  }

  /**
   * Notify all handlers of a new or updated notification
   */
  private notifyHandlers(notification: Notification): void {
    for (const handler of this.notificationHandlers) {
      handler(notification);
    }
  }

  /**
   * Notify all handlers of all notifications (used for bulk updates)
   */
  private notifyAllHandlers(): void {
    const notifications = this.getNotifications();
    for (const notification of notifications) {
      this.notifyHandlers(notification);
    }
  }

  /**
   * Notify handlers of a removed notification
   */
  private notifyRemovedHandler(notification: Notification): void {
    for (const handler of this.notificationHandlers) {
      handler({ ...notification, id: `removed:${notification.id}` });
    }
  }

  /**
   * Clean up resources used by the notification service
   */
  public cleanup(): void {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }

    this.notificationHandlers.clear();
  }
}

// Singleton instance for convenience
export const notificationService = NotificationService.getInstance();

export default NotificationService;
