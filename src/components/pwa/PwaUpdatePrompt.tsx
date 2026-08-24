import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debug-config';

/**
 * Offers a reload when a new build has been downloaded, and confirms when the
 * app is ready to work offline.
 *
 * Deliberately a prompt rather than an automatic update: this app holds a live
 * WebSocket, active P2P channels and in-flight collaborative-document state.
 * Swapping the bundle underneath an open session would drop all of it — quietly,
 * and usually mid-conversation. The user picks the moment.
 *
 * Renders nothing; it drives the shared toast surface so update notices look
 * like every other notification rather than a bespoke banner.
 */

/**
 * How often a running tab asks whether a new build exists.
 *
 * vite-plugin-pwa only checks at registration, i.e. on page load. This is a
 * workspace app people leave open for days at a time, so without a periodic
 * check a long-lived session would never learn an update had shipped — it would
 * sit on the old bundle until something forced a reload. An hour is frequent
 * enough that a deploy reaches people the same working day, and far too
 * infrequent to matter as traffic.
 */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
export function PwaUpdatePrompt() {
  const { toast } = useToast();
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(url, registration) {
      debugLog('PWA', 'Service worker registered', url);
      if (!registration) return;

      const check = () => {
        // Offline, the request only fails and logs noise; the visibility and
        // online listeners below cover the moment connectivity returns.
        if (!navigator.onLine) return;
        registration.update().catch((error) => {
          debugLog('PWA', 'Update check failed', error);
        });
      };

      const timer = setInterval(check, UPDATE_CHECK_INTERVAL_MS);

      // Also check at the two moments a user is most likely to have missed one:
      // coming back to the tab, and coming back online.
      const onVisible = () => {
        if (document.visibilityState === 'visible') check();
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', check);

      // Registration outlives this component in practice, but the listeners
      // should not accumulate if it ever remounts.
      cleanupRef.current = () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', check);
      };
    },
    onRegisterError(error) {
      debugLog('PWA', 'Service worker registration failed', error);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    toast({
      title: 'Ready to work offline',
      description: 'Citadel has been installed and will now load without a connection.',
      variant: 'success',
    });
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady, toast]);

  useEffect(() => {
    if (!needRefresh) return;
    toast({
      title: 'Update available',
      description: 'A new version of Citadel is ready. Reloading will reconnect your session.',
      // No auto-dismiss: this is an action the user should get to on their own time.
      duration: Infinity,
      action: {
        label: 'Reload',
        onClick: () => {
          void updateServiceWorker(true);
        },
      },
    });
    setNeedRefresh(false);
  }, [needRefresh, setNeedRefresh, updateServiceWorker, toast]);

  return null;
}
