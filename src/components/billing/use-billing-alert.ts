/**
 * The coarse billing level of a hosted workspace, from its public `/status`, for the admin
 * sidebar's banner. Asked once per workspace per mount. An answer that cannot be had (an older
 * control plane, a network failure) is no banner, and is logged: the meters behind Plan & billing
 * remain the authority, and a banner that guessed would be worse than none.
 */
import { useEffect, useState } from 'react';
import type { ControlPlane, TenantStatus } from '@/lib/onboarding/control-plane-client';
import type { TenantBilling } from '@/lib/billing/billing-state';
import { debugLog } from '@/lib/debug-config';

export function useBillingAlert(api: ControlPlane | undefined, slug: string | undefined): TenantBilling | undefined {
  const [billing, setBilling] = useState<TenantBilling | undefined>(undefined);
  useEffect(() => {
    setBilling(undefined);
    if (api === undefined || slug === undefined) return;
    const controller: AbortController = new AbortController();
    api.tenantStatus(slug, undefined, controller.signal).then(
      (status: TenantStatus): void => { if (status.status === 'active') setBilling(status.billing); },
      (error: unknown): void => {
        if (!controller.signal.aborted) debugLog('BillingAlert', `no billing level for ${slug}`, error);
      },
    );
    return (): void => controller.abort();
  }, [api, slug]);
  return billing;
}
