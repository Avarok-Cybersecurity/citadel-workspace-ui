/**
 * Tab Notification Service
 *
 * Manages browser tab visual indicators for unread notifications:
 * - Tab title: Updates to "(X) Citadel Workspaces" where X is unread count
 * - Favicon badge: Draws red circle with count on favicon
 *
 * Listens for 'unread-count-changed' events from NotificationService
 * and updates the tab UI accordingly.
 */

import { eventEmitter } from './event-emitter';
import { notificationService, UnreadCountChange } from './notification-service';

class TabNotificationService {
  private unreadCount = 0;
  private originalTitle = 'Citadel Workspaces';
  private originalFaviconHref: string | null = null;
  private isTabVisible = true;
  private initialized = false;

  constructor() {
    // Defer initialization until DOM is ready
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.initialize());
      } else {
        this.initialize();
      }
    }
  }

  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Store original favicon href for reset
    const faviconLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (faviconLink) {
      this.originalFaviconHref = faviconLink.href;
    }

    // Store original title
    this.originalTitle = document.title || 'Citadel Workspaces';

    this.setupVisibilityListener();
    this.subscribeToNotifications();

    // Initialize with current unread count
    this.updateUnreadCount();

    console.log('[TabNotification] Service initialized');
  }

  private setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', () => {
      this.isTabVisible = document.visibilityState === 'visible';
      // Note: We don't auto-reset count when tab becomes visible
      // The count is reset when user views the notification center (markAllAsRead)
    });
  }

  private subscribeToNotifications(): void {
    // Listen for unread count changes from notification service
    eventEmitter.on('unread-count-changed', (data: UnreadCountChange) => {
      this.unreadCount = data.total;
      this.updateTitle();
      this.updateFavicon();
    });

    // Also subscribe to notification handler for immediate updates
    notificationService.registerNotificationHandler(() => {
      // The handler is called on every notification change,
      // but we rely on unread-count-changed for actual count
    });
  }

  private updateUnreadCount(): void {
    const unread = notificationService.getUnreadNotifications().length;
    this.unreadCount = unread;
    this.updateTitle();
    this.updateFavicon();
  }

  private updateTitle(): void {
    if (this.unreadCount > 0) {
      document.title = `(${this.unreadCount}) ${this.originalTitle}`;
    } else {
      document.title = this.originalTitle;
    }
  }

  private updateFavicon(): void {
    if (this.unreadCount === 0) {
      this.resetFavicon();
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load original favicon as base
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Draw original favicon
      ctx.drawImage(img, 0, 0, 32, 32);

      // Draw badge circle (red)
      ctx.beginPath();
      ctx.arc(24, 8, 8, 0, 2 * Math.PI);
      ctx.fillStyle = '#ef4444'; // Tailwind red-500
      ctx.fill();

      // Draw count text (white)
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const displayCount = this.unreadCount > 9 ? '9+' : this.unreadCount.toString();
      ctx.fillText(displayCount, 24, 8);

      // Update favicon link element
      this.setFaviconHref(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      // If original favicon fails to load, draw badge on blank canvas
      ctx.fillStyle = '#1e1e2e'; // Dark background
      ctx.fillRect(0, 0, 32, 32);

      // Draw badge circle
      ctx.beginPath();
      ctx.arc(24, 8, 8, 0, 2 * Math.PI);
      ctx.fillStyle = '#ef4444';
      ctx.fill();

      // Draw count text
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const displayCount = this.unreadCount > 9 ? '9+' : this.unreadCount.toString();
      ctx.fillText(displayCount, 24, 8);

      this.setFaviconHref(canvas.toDataURL('image/png'));
    };

    // Use stored original or try default locations
    img.src = this.originalFaviconHref || '/favicon.ico';
  }

  private setFaviconHref(href: string): void {
    let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
  }

  private resetFavicon(): void {
    if (this.originalFaviconHref) {
      this.setFaviconHref(this.originalFaviconHref);
    } else {
      // Try to reset to default favicon locations
      const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (link) {
        link.href = '/favicon.ico';
      }
    }
  }

  /**
   * Manually reset the unread count and update UI.
   * Called when user actively views all notifications.
   */
  public resetCount(): void {
    this.unreadCount = 0;
    this.updateTitle();
    this.resetFavicon();
  }

  /**
   * Get current unread count
   */
  public getUnreadCount(): number {
    return this.unreadCount;
  }

  /**
   * Check if the tab is currently visible
   */
  public isVisible(): boolean {
    return this.isTabVisible;
  }
}

// Singleton instance - auto-initializes on import
export const tabNotificationService = new TabNotificationService();

export default TabNotificationService;
