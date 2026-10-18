/**
 * Opening the Stripe billing portal for the holder of a claim code, including the one refusal
 * that asks something of the person first: `customer-terms-stale`, answered by accepting the
 * current Customer Terms and asking again with that version.
 */
import { useState } from 'react';
import type { ControlPlane } from '@/lib/onboarding/control-plane-client';
import {
  describePortalRefusal,
  staleCustomerTermsVersion,
  type PortalRefusal,
  type PortalTab,
} from '@/lib/onboarding/billing-portal';

export type PortalOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'opening' }
  | { readonly kind: 'opened'; readonly portalUrl: string; readonly blocked: boolean }
  /** The terms moved on: `current` is the version the control plane will accept. */
  | { readonly kind: 'terms-stale'; readonly current: number }
  | { readonly kind: 'refused'; readonly refusal: PortalRefusal };

export interface PortalOpener {
  readonly outcome: PortalOutcome;
  /** Call from the click itself, so the tab it opens is not blocked as a popup. */
  readonly open: (acceptedCustomerTermsVersion: number | undefined) => Promise<void>;
  /** Back to idle, after the person declined the new terms. */
  readonly dismiss: () => void;
}

export function usePortalOpener(api: ControlPlane, slug: string, claimCode: string, openTab: () => PortalTab | null): PortalOpener {
  const [outcome, setOutcome] = useState<PortalOutcome>({ kind: 'idle' });
  const open = async (accepted: number | undefined): Promise<void> => {
    if (outcome.kind === 'opening') return;
    const tab: PortalTab | null = openTab();
    setOutcome({ kind: 'opening' });
    try {
      const portalUrl: string = await api.openPortal(slug, claimCode, accepted);
      if (tab) tab.navigate(portalUrl);
      setOutcome({ kind: 'opened', portalUrl, blocked: tab === null });
    } catch (error: unknown) {
      tab?.close();
      const current: number | undefined = staleCustomerTermsVersion(error);
      setOutcome(current === undefined ? { kind: 'refused', refusal: describePortalRefusal(error) } : { kind: 'terms-stale', current });
    }
  };
  return { outcome, open, dismiss: (): void => setOutcome({ kind: 'idle' }) };
}
