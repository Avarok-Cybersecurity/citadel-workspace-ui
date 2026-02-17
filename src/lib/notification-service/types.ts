/**
 * Notification Service Types
 *
 * Type definitions for the notification system.
 */

export interface UnreadCountChange {
  total: number;
  messages: number;
  peerRegistrations: number;
  system: number;
  byCid: Map<string, number>; // Per-session notification counts
}

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
  recipientCid?: string; // CID of the session this notification belongs to
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

export type NotificationHandler = (notification: Notification) => void;
