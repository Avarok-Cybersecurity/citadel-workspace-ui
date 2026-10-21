/**
 * The consent panel's overlay guard, fed from the page: the panel counts as shown from its mount
 * while the tab is visible (hiding the tab starts the 600 ms again), and any pointer movement or
 * focus-moving key after that counts as the person being there. See lib/citadel-apps/consent-gate.ts.
 */
import { useEffect, useReducer, useState } from 'react';
import { CONSENT_VISIBLE_MS, gateOpen, gateReducer, HIDDEN_GATE, NAVIGATION_KEYS, type GateState } from '@/lib/citadel-apps/consent-gate';

export function useConsentGate(): boolean {
  const [state, dispatch] = useReducer(gateReducer, HIDDEN_GATE);
  const [, setNow] = useState<number>(0);

  useEffect(() => {
    const visibility = (): void => {
      dispatch(document.visibilityState === 'visible' ? { kind: 'shown', at: Date.now() } : { kind: 'hidden' });
    };
    const moved = (): void => dispatch({ kind: 'moved' });
    const key = (event: KeyboardEvent): void => { if (NAVIGATION_KEYS.has(event.key)) moved(); };
    visibility();
    window.addEventListener('pointermove', moved);
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', visibility);
    return (): void => {
      window.removeEventListener('pointermove', moved);
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  // Draw again when the 600 ms have run, so the button enables without another event.
  useEffect(() => {
    const s: GateState = state;
    if (s.shownAt === null) return undefined;
    const remaining: number = s.shownAt + CONSENT_VISIBLE_MS - Date.now();
    if (remaining <= 0) return undefined;
    const timer: number = window.setTimeout(() => setNow(Date.now()), remaining);
    return (): void => window.clearTimeout(timer);
  }, [state]);

  return gateOpen(state, Date.now());
}
