import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-online-status';

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
export function OfflineBanner() {
  const { isOnline, justReconnected } = useOnlineStatus();

  if (isOnline && !justReconnected) return null;

  const offline = !isOnline;

  return (
    <div
      // role="status" with a polite live region: announced to screen readers
      // without interrupting whatever they are reading, which is right for a
      // change in ambient condition rather than a response to an action.
      role="status"
      aria-live="polite"
      data-testid={offline ? 'offline-banner' : 'reconnected-banner'}
      className={[
        // Below the header, not over it. At z-100 against the header's z-50, both
        // anchored to top-0 and neither in flow, this covered the whole 56px bar
        // — taking the sidebar toggle, the workspace switcher, notifications and
        // the account menu with it, at the exact moment it was telling the user
        // something was wrong. At 375px the copy wraps to two lines and matches
        // the header height almost exactly.
        'fixed inset-x-0 top-14 z-40 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium',
        // Not red: being offline is a condition to inform about, not an error
        // the user caused or can fix by retrying.
        offline
          ? 'bg-muted text-foreground border-b border-surface'
          : 'bg-primary/15 text-primary-foreground border-b border-primary/30',
      ].join(' ')}
    >
      {offline ? (
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
