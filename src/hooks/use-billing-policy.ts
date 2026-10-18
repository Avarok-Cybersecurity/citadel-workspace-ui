/**
 * The billing policy, asked of the control plane once, when a screen first
 * needs it. While it is on its way the screen's choices stay disabled; when it
 * fails the screen shows the client's sentence and offers to ask again. There
 * is never a stand-in policy: copy rendered from invented numbers would be a
 * promise nobody enforces.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { ControlPlaneError, type ControlPlane } from '@/lib/onboarding/control-plane-client';
import type { BillingPolicy } from '@/lib/billing/billing-policy';

export type PolicyLoad =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly policy: BillingPolicy }
  | { readonly kind: 'failed'; readonly message: string };

export interface BillingPolicyHandle {
  readonly load: PolicyLoad;
  readonly retry: () => void;
}

const UNKNOWN_FAILURE: string = "Billing terms couldn't be loaded. Please try again.";

/** `wanted` starts the request; once ready it is never asked again for this mount. */
export function useBillingPolicy(api: ControlPlane, wanted: boolean): BillingPolicyHandle {
  const [load, setLoad] = useState<PolicyLoad>({ kind: 'idle' });
  const [attempt, setAttempt] = useState<number>(0);
  const settled: MutableRefObject<boolean> = useRef<boolean>(false);

  useEffect(() => {
    if (!wanted || settled.current) return;
    let live: boolean = true;
    setLoad({ kind: 'loading' });
    api.policy().then(
      (policy: BillingPolicy): void => {
        if (!live) return;
        settled.current = true;
        setLoad({ kind: 'ready', policy });
      },
      (error: unknown): void => {
        if (live) setLoad({ kind: 'failed', message: error instanceof ControlPlaneError ? error.message : UNKNOWN_FAILURE });
      },
    );
    return (): void => { live = false; };
    // `attempt` re-runs it after a failure; `settled` keeps a success from being asked twice.
  }, [api, wanted, attempt]);

  const retry: () => void = useCallback((): void => {
    setAttempt((n: number) => n + 1);
  }, []);
  return { load, retry };
}
