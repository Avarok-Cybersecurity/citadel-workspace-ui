import { useCallback, useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { announceWhenQuiet } from './announce-when-quiet';
import { useToast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debug-config';
import { applyWaitingUpdate } from '@/lib/pwa/apply-waiting-update';

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

/** One identity for the update offer, so re-offering replaces rather than stacks. */
const UPDATE_TOAST_ID = 'pwa-update-available';
export function PwaUpdatePrompt() {
  const { toast } = useToast();

  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  // Whether the user clicked Reload in THIS window.
  //
  // skipWaiting activates the new worker for every client at once, so the
  // `controlling` event fires everywhere — and the library reloads on it unless
  // onNeedReload is supplied. Without this gate, one window's click reloaded
  // all of them, dropping each one's WebSocket and P2P channels mid-session.
  // A ref, not state: it is read inside a callback the library owns, and it
  // must not trigger a render.
  const weInitiatedUpdate = useRef(false);
  // `toast` is declared below and the callback above closes over this instead,
  // so the callback does not depend on declaration order.
  const toastRef = useRef<
    | ((opts: {
        title: string;
        description?: string;
        action?: { label: string; onClick: () => void };
      }) => void)
    | null
  >(null);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW({
    onNeedReload: () => {
      if (weInitiatedUpdate.current) {
        window.location.reload();
        return;
      }
      // Another window took the update. Say so rather than yanking the page
      // out from under someone mid-conversation.
      // With an action, not just an instruction. An installed standalone
      // window has no reload button and no URL bar, so "reload when you are
      // ready" was something the user could not actually do — and the
      // re-offer-on-return path cannot help here either, because it is gated on
      // `registration.waiting`, which is already null once another window has
      // activated the new worker.
      toastRef.current?.({
        title: 'Updated in another window',
        description: 'Reload to pick up the new version.',
        action: { label: 'Reload', onClick: () => window.location.reload() },
      });
    },
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

  /**
   * The single accept path for both the first offer and the return-to-tab
   * re-offer. Setting `weInitiatedUpdate` is what makes `onNeedReload` reload
   * THIS window instead of showing "Updated in another window" — the re-offer
   * used to omit it, so the user pressed Reload and was told to reload.
   */
  const acceptUpdate = useCallback(() => {
    weInitiatedUpdate.current = true;
    void (async () => {
      // `applyWaitingUpdate` rather than the library's `updateServiceWorker`,
      // because it reports whether a worker actually took control.
      //
      // Once another window has accepted the update, `registration.waiting` is
      // null everywhere -- and messaging SKIP_WAITING to nothing is a silent
      // no-op, so `controlling` never fires again. A window still showing its
      // original "Update available" toast therefore had a Reload button that
      // did nothing at all: the toast dismissed and the page stayed put.
      //
      // Worse, `weInitiatedUpdate` stayed true. On the NEXT deploy, if another
      // window accepted first, this window's `onNeedReload` would see the stale
      // flag and hard-reload mid-session without asking -- dropping the
      // WebSocket and P2P state that prompt-mode exists to protect.
      if (await applyWaitingUpdate()) return;
      weInitiatedUpdate.current = false;
      // The user pressed a button and is owed an outcome. If the new version is
      // already active elsewhere, a plain reload is what picks it up here.
      window.location.reload();
    })();
  }, []);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    if (!offlineReady) return;
    // Held until the screen is quiet: this is a capability notice with no
    // deadline, and it was landing beside "Could not reach the server" on a
    // failed first-run registration -- a green success toast next to the error
    // the user has to act on. See announce-when-quiet.
    const cancel = announceWhenQuiet(() => {
      toast({
        title: 'Ready to work offline',
        description: 'Citadel has been installed and will now load without a connection.',
        variant: 'success',
      });
    });
    setOfflineReady(false);
    return cancel;
  }, [offlineReady, setOfflineReady, toast]);

  useEffect(() => {
    if (!needRefresh) return;
    toast({
      title: 'Update available',
      description: 'A new version of Citadel is ready. Reloading will reconnect your session.',
      // No auto-dismiss: this is an action the user should get to on their own time.
      duration: Infinity,
      // Same id as the re-offer below. Both are infinite-duration, and the
      // re-offer fires on every return to the tab, so without a shared identity
      // a user who tabbed in and out collected a stack of identical prompts.
      id: UPDATE_TOAST_ID,
      action: { label: 'Reload', onClick: acceptUpdate },
    });
    setNeedRefresh(false);
  }, [needRefresh, setNeedRefresh, acceptUpdate, toast]);

  // Re-offer the update when the user comes back to the tab.
  //
  // The effect above clears `needRefresh` as soon as the toast is raised, and
  // the service worker's `waiting` event does not fire again for the same
  // worker. So dismissing the toast once was terminal: the user stayed on that
  // build indefinitely, through any number of later releases, with nothing to
  // escalate and no way to ask for the update again.
  //
  // `registration.waiting` is the durable fact — it stays non-null for as long
  // as a new version is sitting there — so returning to the tab is a natural,
  // bounded moment to raise it again without nagging mid-task.
  useEffect(() => {
    const offerIfWaiting = () => {
      if (document.visibilityState !== 'visible') return;
      void navigator.serviceWorker?.getRegistration()
        .then((registration) => {
          if (!registration?.waiting) return;
          toast({
            title: 'Update available',
            description: 'A new version of Citadel is ready. Reloading will reconnect your session.',
            duration: Infinity,
            id: UPDATE_TOAST_ID,
            action: { label: 'Reload', onClick: acceptUpdate },
          });
        })
        .catch(() => undefined);
    };

    document.addEventListener('visibilitychange', offerIfWaiting);
    return () => document.removeEventListener('visibilitychange', offerIfWaiting);
  }, [toast, acceptUpdate]);

  return null;
}
