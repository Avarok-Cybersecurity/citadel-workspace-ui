import { useEffect } from 'react';
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
export function PwaUpdatePrompt() {
  const { toast } = useToast();

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(url) {
      debugLog('PWA', 'Service worker registered', url);
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
