import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { callOutcomeMessage, callOutcomePeerName } from '@/lib/call/call-outcome-message';
import type { CallState } from '@/lib/call/call-state';

/**
 * Whether calling is possible here, and telling the caller how a call ended.
 *
 * Extracted from CallProvider to keep it under the file cap. Both concerns are
 * "what do we say to the user about calling", and both were places the UI went
 * quiet: the probe could sit on "Checking…" for ever, and every non-connecting
 * outcome presented as the panel silently vanishing.
 */
export function useCallCapability({
  call,
  isLeaderTab,
}: {
  call: CallState | null;
  isLeaderTab: boolean;
}): { capability: { supported: boolean; reason?: string } } {
  // Once per call: the terminal state survives teardown, so this would
  // otherwise re-fire on every later render.
  const announcedOutcome = useRef<string | null>(null);
  useEffect(() => {
    if (!call || call.status !== 'ended') return;
    // Only the caller is left guessing; the callee knows what they pressed.
    if (!call.outgoing) return;
    if (announcedOutcome.current === call.callId) return;

    const message: string | null = callOutcomeMessage(call.reason, callOutcomePeerName(call));
    if (!message) return;
    announcedOutcome.current = call.callId;
    toast(message);
  }, [call]);

  const [browserCapability, setBrowserCapability] = useState<{ supported: boolean; reason?: string }>({
    supported: false,
    reason: 'Checking whether this browser supports calls…',
  });

  // A follower tab has no WebSocket client, so MediaOpen threw, MediaClose did
  // nothing and every frame was dropped on the floor — a call that looked
  // placed and carried no audio. Reported as a capability so the existing
  // disabled-with-a-reason treatment covers it: the buttons stay visible and
  // explain themselves rather than vanishing or lying.
  const capability: { supported: boolean; reason?: string; } = useMemo((): { supported: boolean; reason?: string; } => {
    if (!browserCapability.supported) return browserCapability;
    if (!isLeaderTab) {
      return {
        supported: false,
        reason: 'Calls run in whichever Citadel tab you opened first. Switch to it to call.',
      };
    }
    return browserCapability;
  }, [browserCapability, isLeaderTab]);

  useEffect(() => {
    let cancelled: boolean = false;
    // Imported on demand, like the session below: the probe lives in
    // codec-support, which drags the whole codec table in with it.
    void import('@/lib/call/codec-support')
      .then((m) => m.probeMediaCapabilities())
      .then((report) => {
        if (!cancelled) setBrowserCapability({ supported: report.supported, reason: report.reason });
      })
      .catch(() => {
        // Without this the initial "Checking…" was permanent: a redeploy that
        // invalidated this chunk's hash left the buttons disabled behind a
        // tooltip claiming a check was still running.
        if (!cancelled) {
          setBrowserCapability({
            supported: false,
            reason: 'Could not load calling support. Reload the page to try again.',
          });
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, []);


  return { capability };
}
