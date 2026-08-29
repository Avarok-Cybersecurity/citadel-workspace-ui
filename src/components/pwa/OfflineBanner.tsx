import { WifiOff, Wifi } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useServiceHealth } from '@/hooks/use-service-health';

/**
 * Tell the user when the device has lost connectivity.
 *
 * This matters more once the app is installed than it does in a tab. A PWA
 * launched from the home screen has no browser chrome, so there is nothing to
 * reveal that the network dropped — the app simply stops working, and a failure
 * to reach the workspace looks identical to the app being broken.
 *
 * Deliberately a persistent banner rather than a toast: being offline is a
 * STATE, not an event. A toast that has already faded cannot answer "why is
 * nothing loading?" thirty seconds later.
 */
export function OfflineBanner(): JSX.Element | null {
  const { isOnline, justReconnected } = useOnlineStatus();
  // The local agent can be unreachable while the DEVICE is online — it runs on
  // localhost. That produced exactly the symptom this banner exists to explain,
  // and was reported nowhere: the health poll ran every 10s to zero listeners.
  const { isHealthy } = useServiceHealth();
  const ref = useRef<HTMLDivElement>(null);
  const agentDown: boolean = isOnline && !isHealthy;
  const showing: boolean = !isOnline || justReconnected || agentDown;

  // Publish the banner's real height so the layout can make room for it. It is
  // `fixed`, so it took no space and covered the first ~36px of BOTH the sidebar
  // and the content pane — the header is h-14 and main is pt-14, so the banner's
  // top-14 lands exactly where content begins. Measured rather than hardcoded
  // because the copy wraps to two lines at 375px.
  useLayoutEffect(() => {
    const root: HTMLElement = document.documentElement;
    const el: HTMLDivElement | null = ref.current;
    if (!showing || !el) {
      root.style.removeProperty('--offline-banner-height');
      return;
    }
    const publish = (): void => root.style.setProperty('--offline-banner-height', `${el.offsetHeight}px`);
    publish();
    const observer: ResizeObserver = new ResizeObserver(publish);
    observer.observe(el);
    return (): void => {
      observer.disconnect();
      root.style.removeProperty('--offline-banner-height');
    };
  }, [showing]);

  if (!showing) return null;

  const offline: boolean = !isOnline;

  return (
    <div
      ref={ref}
      // role="status" with a polite live region: announced to screen readers
      // without interrupting whatever they are reading, which is right for a
      // change in ambient condition rather than a response to an action.
      role="status"
      aria-live="polite"
      // Three states, three names. This read `offline ? 'offline-banner' :
      // 'reconnected-banner'`, and `agentDown` implies the device IS online --
      // so the alarming "agent unreachable" state was labelled as the green
      // "back online" one, and anything asserting on these ids read the two as
      // each other.
      data-testid={offline ? 'offline-banner' : agentDown ? 'agent-down-banner' : 'reconnected-banner'}
      className={[
        // Below the header, not over it. At z-100 anchored to top-0 this covered
        // the whole 56px bar — taking the sidebar toggle, workspace switcher,
        // notifications and account menu with it, at the exact moment it was
        // telling the user something was wrong.
        //
        // But z-40 put it UNDER every full-screen surface that appears while
        // offline: the opaque z-50 workspace loader, the z-[100] LoadingModal
        // and the auth modals. The one explanation of why nothing is loading was
        // painted over by the thing that was not loading. top-14 is what keeps
        // the header clear, so the z-index is free to go above them — a 36px
        // strip below the header cannot swallow a control the way top-0 did.
        // The offset follows whether a header exists: AppLayout publishes
        // `--app-header-height` while it is mounted, and the landing page —
        // which has no header and IS the offline cold-start screen — leaves it
        // unset, so the strip sits at the top there instead of floating over
        // the hero.
        'fixed inset-x-0 top-[var(--app-header-height,0px)] z-[110] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium',
        // Not red: being offline is a condition to inform about, not an error
        // the user caused or can fix by retrying.
        offline || agentDown
          ? 'bg-muted text-foreground border-b border-surface'
          : 'bg-primary/15 text-primary-foreground border-b border-primary/30',
      ].join(' ')}
    >
      {agentDown ? (
        <>
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          {/* Names the agent, not "the server": this is the local process the
              user can actually restart, and telling them "connection lost"
              would send them to check their wifi, which is fine. */}
          <span>Can&rsquo;t reach the Citadel agent on this machine. Check that it is running.</span>
        </>
      ) : offline ? (
        <>
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          {/* Says what actually happens. There is no outbox: a send while
              offline throws, the message is marked failed, and the only
              recovery is the per-message retry button in its bubble. Promising
              automatic delivery meant a user could type, send, pocket the
              phone, and never learn the message did not go. Restore the old
              copy only together with a drain-on-reconnect. */}
          <span>You&rsquo;re offline. Messages won&rsquo;t send until you&rsquo;re back &mdash; tap retry on any that fail.</span>
        </>
      ) : (
        <>
          <Wifi className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Back online.</span>
        </>
      )}
    </div>
  );
}
