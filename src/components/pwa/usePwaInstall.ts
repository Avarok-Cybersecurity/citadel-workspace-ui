import { useCallback, useEffect, useState } from 'react';
import { debugLog } from '@/lib/debug-config';

/**
 * The `beforeinstallprompt` event, which TypeScript's DOM lib does not declare.
 * Chromium fires it when the page meets the installability criteria (manifest +
 * service worker with a fetch handler + secure context).
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export interface PwaInstallState {
  /** True once the browser has offered an install prompt we can replay. */
  canInstall: boolean;
  /** True when already running as an installed app, so installing is moot. */
  isInstalled: boolean;
  /** Shows the browser's install dialog. Resolves to whether the user accepted. */
  install: () => Promise<boolean>;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // `display-mode: standalone` covers Chromium/Firefox; `navigator.standalone`
  // is the iOS Safari equivalent, which does not implement the media query.
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone;
}

/**
 * Install affordance for the PWA.
 *
 * Chrome shows its own install button in the omnibox once the criteria are met;
 * this exists so the app can *also* offer it somewhere discoverable, since that
 * omnibox affordance is easy to miss and absent on some platforms.
 *
 * The event must be captured when it fires — it cannot be requested later — so
 * the listener is installed on mount and the event stashed until the user acts.
 */
export function usePwaInstall(): PwaInstallState {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(detectStandalone);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress the automatic mini-infobar so the app controls placement.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      debugLog('PWA', 'Install prompt available');
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setPromptEvent(null);
      debugLog('PWA', 'App installed');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // Launching an already-installed copy changes display-mode without a reload.
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = (e: MediaQueryListEvent) => setIsInstalled(e.matches);
    standaloneQuery.addEventListener('change', onDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      standaloneQuery.removeEventListener('change', onDisplayModeChange);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // The event is single-use whichever way it goes; a dismissal means the
    // browser decides when (or whether) to offer another.
    setPromptEvent(null);
    debugLog('PWA', `Install prompt ${outcome}`);
    return outcome === 'accepted';
  }, [promptEvent]);

  return { canInstall: promptEvent !== null && !isInstalled, isInstalled, install };
}
