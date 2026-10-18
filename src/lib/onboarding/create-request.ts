/**
 * The `POST /api/tenants` body for what the visitor chose. Pure: the flow
 * hands in its draft, the spent human-check token and the overage choice.
 */
import type { CreateTenantRequest } from './control-plane-client';
import type { FlowDraft } from './create-flow';
import { SHOWN_CUSTOMER_TERMS_VERSION } from '@/lib/terms/customer-terms';
import { clampSeats, clampStorageBlocks, isPaid } from './tiers';

/**
 * `overageBilling` is the visitor's own pick, undefined until they make one. A paid workspace
 * cannot be asked for without it (the control plane refuses one, and there is no default to
 * fall back on); a Free one never sends it.
 */
export function createTenantRequest(draft: FlowDraft, turnstileToken: string, overageBilling: boolean | undefined): CreateTenantRequest {
  const base: CreateTenantRequest = {
    slug: draft.slug,
    display_name: draft.displayName.trim(),
    tier: draft.plan.tier,
    turnstile_token: turnstileToken,
    accepted_customer_terms_version: SHOWN_CUSTOMER_TERMS_VERSION,
    ...(draft.reservationToken ? { reservation_token: draft.reservationToken } : {}),
  };
  if (!isPaid(draft.plan.tier)) return base;
  if (overageBilling === undefined) throw new Error('a paid workspace needs an overage-billing choice before it is created');
  return {
    ...base,
    interval: draft.plan.interval,
    seats: clampSeats(draft.plan.tier, draft.plan.seats),
    storage_blocks: clampStorageBlocks(draft.plan.tier, draft.plan.storageBlocks),
    overage_billing: overageBilling,
  };
}
