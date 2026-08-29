import type { Notification as AppNotification } from './types';

/**
 * Shows an OS-level notification, on whichever surface this platform provides.
 *
 * Extracted from the service so the platform handling has room to be explicit.
 * The guard is the point: on Chromium for Android the `Notification`
 * constructor THROWS ("Illegal constructor. Use
 * ServiceWorkerRegistration.showNotification() instead") rather than no-opping,
 * and this is reached from the last statement of the inbound-message handler —
 * so every message received while backgrounded produced an unhandled
 * rejection. The service-worker path is tried first because it is the
 * supported one there.
 */
export function showBrowserNotification(notification: AppNotification): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    // Guarded, like playNotificationSound beside it: on Chromium for Android
    // this constructor THROWS rather than no-ops, from the last statement of
    // the inbound-message handler — so every message received while
    // backgrounded produced an unhandled rejection. SW path first, since it
    // is the supported one there.
    void (async (): Promise<void> => {
      try {
        const registration: ServiceWorkerRegistration = await navigator.serviceWorker?.ready;
        if (registration) {
          await registration.showNotification(notification.title, {
            body: notification.content,
            icon: '/favicon.ico',
            tag: notification.id,
          });
          return;
        }
      } catch {
        // Fall through to the constructor below.
      }
      try {
        new Notification(notification.title, {
          body: notification.content,
          icon: '/favicon.ico',
          tag: notification.id,
        });
      } catch {
        // No notification surface on this platform; the message itself has
        // already been stored and emitted, so there is nothing to recover.
      }
    })();
  } else if (Notification.permission !== 'denied') {
    // Fire-and-forget: we don't gate the rest of the notification
    // pipeline on the user's permission decision.
    void Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(notification.title, {
          body: notification.content,
          icon: '/favicon.ico',
          tag: notification.id,
        });
      }
    });
  }
}
