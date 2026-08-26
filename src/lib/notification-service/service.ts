/**
 * Notification Service
 *
 * Centralized service to manage all types of notifications in the application.
 */
import { eventEmitter } from '../event-emitter';
import { showBrowserNotification } from './browser-notification';
import { v4 as uuidv4 } from 'uuid';
import { debugLog } from '@/lib/debug-config';
import type { Notification, NotificationHandler, UnreadCountChange } from './types';
import { NotificationType, NotificationPriority, notificationBelongsTo } from './types';

export class NotificationService {
  private static instance: NotificationService;
  private notifications: Map<string, Notification> = new Map();
  private notificationHandlers: Set<NotificationHandler> = new Set();
  private unlisten: (() => void) | null = null;

  private constructor() {
    this.unlisten = eventEmitter.on<Notification>('notification', (n) => this.addNotification(n));
    debugLog('NotificationService', 'NotificationService event listeners set up');
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public addNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): Notification {
    const fullNotification: Notification = {
      ...notification, id: uuidv4(), timestamp: Date.now(), read: false
    };
    this.notifications.set(fullNotification.id, fullNotification);
    this.notifyHandlers(fullNotification);
    this.notifyUnreadChange();

    // Browser notification + sound when tab is not focused
    if (typeof document !== 'undefined' && document.hidden) {
      showBrowserNotification(fullNotification);
      this.playNotificationSound();
    }

    return fullNotification;
  }

  private playNotificationSound(): void {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio not available
    }
  }

  public addMessageNotification(
    title: string, content: string, senderId: string,
    messageId: string, recipientCid?: string, data?: Record<string, any>
  ): Notification {
    return this.addNotification({
      type: NotificationType.MESSAGE, title, content, senderId,
      sourceId: messageId, recipientCid, priority: NotificationPriority.NORMAL, data
    });
  }

  public addPeerRegistrationNotification(
    peerUsername: string, peerCid: string, requestId: string,
    onAccept: () => void, onDecline: () => void, onCardClick: () => void,
    recipientCid?: string
  ): Notification {
    return this.addNotification({
      type: NotificationType.PEER_REGISTRATION,
      title: `${peerUsername} wants to connect`,
      content: `CID: ${peerCid.slice(0, 12)}...`,
      senderId: peerCid, sourceId: requestId, recipientCid,
      priority: NotificationPriority.HIGH,
      actionButtons: [
        { id: 'accept', label: 'Accept', variant: 'default', onClick: onAccept },
        { id: 'decline', label: 'Decline', variant: 'destructive', onClick: onDecline }
      ],
      data: { requestId, peerCid, peerUsername, onCardClick }
    });
  }

  public addSystemNotification(
    title: string, content: string,
    priority: NotificationPriority = NotificationPriority.NORMAL,
    recipientCid?: string
  ): Notification {
    return this.addNotification({
      type: NotificationType.SYSTEM, title, content, priority, recipientCid
    });
  }

  public markAsRead(notificationId: string): void {
    const notification = this.notifications.get(notificationId);
    if (notification && !notification.read) {
      notification.read = true;
      this.notifications.set(notificationId, notification);
      this.notifyHandlers(notification);
      this.notifyUnreadChange();
    }
  }

  public markAllAsRead(): void {
    let anyChanged = false;
    for (const [id, notification] of this.notifications.entries()) {
      if (!notification.read) {
        notification.read = true;
        this.notifications.set(id, notification);
        anyChanged = true;
      }
    }
    this.notifyAllHandlers();
    if (anyChanged) { this.notifyUnreadChange(); }
  }

  public markMessageNotificationsAsReadBySender(senderId: string): void {
    let anyChanged = false;
    for (const [id, notification] of this.notifications.entries()) {
      if (notification.type === NotificationType.MESSAGE &&
        notification.senderId === senderId && !notification.read) {
        notification.read = true;
        this.notifications.set(id, notification);
        anyChanged = true;
      }
    }
    if (anyChanged) { this.notifyUnreadChange(); }
  }

  public removeNotification(notificationId: string): void {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      const wasUnread = !notification.read;
      this.notifications.delete(notificationId);
      this.notifyRemovedHandler(notification);
      if (wasUnread) { this.notifyUnreadChange(); }
    }
  }

  public getNotifications(): Notification[] {
    return Array.from(this.notifications.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  public getUnreadNotifications(): Notification[] {
    return this.getNotifications().filter(n => !n.read);
  }

  public getNotificationsByType(type: NotificationType): Notification[] {
    return this.getNotifications().filter(n => n.type === type);
  }

  /**
   * The notifications that belong to `cid`, plus those belonging to no session.
   *
   * `recipientCid` was recorded on every notification and plumbed through to
   * `getUnreadCountByCid` — and the panel that actually renders them ignored it
   * entirely, filtering only by type. Message notifications carry a
   * 100-character plaintext preview and the sender's name, so a tab that
   * switched accounts (the workspace-switcher / ClaimSession flow this product
   * is built around) showed the previous account's messages to the new one.
   * `cleanup()` has no callers, so nothing clears them on logout either.
   *
   * Undefined `recipientCid` means "not session-scoped" and is always shown.
   */
  public getNotificationsForCid(cid: string | null): Notification[] {
    return this.getNotifications().filter((n) => notificationBelongsTo(n, cid));
  }

  public getUnreadCountByCid(cid: string): number {
    return Array.from(this.notifications.values())
      .filter(n => !n.read && n.recipientCid === cid).length;
  }

  public getUnreadCountsByCid(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const notification of this.notifications.values()) {
      if (!notification.read && notification.recipientCid) {
        const current = counts.get(notification.recipientCid) || 0;
        counts.set(notification.recipientCid, current + 1);
      }
    }
    return counts;
  }

  public notifyUnreadChange(): void {
    const notifications = Array.from(this.notifications.values());
    const unread = notifications.filter(n => !n.read);
    const change: UnreadCountChange = {
      total: unread.length,
      messages: unread.filter(n => n.type === NotificationType.MESSAGE).length,
      peerRegistrations: unread.filter(n => n.type === NotificationType.PEER_REGISTRATION).length,
      system: unread.filter(n => n.type === NotificationType.SYSTEM).length,
      byCid: this.getUnreadCountsByCid()
    };
    eventEmitter.emit('unread-count-changed', change);
  }

  public registerNotificationHandler(handler: NotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => { this.notificationHandlers.delete(handler); };
  }

  private notifyHandlers(notification: Notification): void {
    for (const handler of this.notificationHandlers) { handler(notification); }
  }

  private notifyAllHandlers(): void {
    for (const notification of this.getNotifications()) { this.notifyHandlers(notification); }
  }

  private notifyRemovedHandler(notification: Notification): void {
    for (const handler of this.notificationHandlers) {
      handler({ ...notification, id: `removed:${notification.id}` });
    }
  }

  public cleanup(): void {
    if (this.unlisten) { this.unlisten(); this.unlisten = null; }
    this.notificationHandlers.clear();
  }
}

export const notificationService = NotificationService.getInstance();

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.notificationService = notificationService;
}
