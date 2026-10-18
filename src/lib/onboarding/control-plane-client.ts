/**
 * The tenant control plane, as the create-workspace flow sees it.
 *
 * Same origin, at the base path the deployment publishes (control-plane-config.ts,
 * normally `/api`) -- so the page's `connect-src 'self'` already covers
 * it and no CORS is involved. The transport is injected (`FetchLike`) so every
 * branch below is testable against a scripted response, with no network and no
 * module mocking.
 *
 * Every response is parsed, not trusted. A body that does not have the shape the
 * contract promises is an error with a sentence a visitor can read, never an
 * `undefined` that surfaces three screens later.
 */
import type { BillingInterval, TierId } from './tiers';
import { parseBillingPolicy, type BillingPolicy } from '@/lib/billing/billing-policy';
import { parseTenantBilling, parseUsageReport, type TenantBilling, type UsageReport } from '@/lib/billing/billing-state';
import { malformed, optionalString, postJson, send, type FetchLike } from './control-plane-transport';

export { ControlPlaneError, type FetchLike } from './control-plane-transport';

export type UnavailableReason = 'invalid' | 'reserved' | 'taken';

export type SlugAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: UnavailableReason | undefined };

export interface CreateTenantRequest {
  readonly slug: string;
  readonly display_name: string;
  readonly tier: TierId;
  readonly interval?: BillingInterval;
  readonly seats?: number;
  readonly storage_blocks?: number;
  readonly turnstile_token: string;
  /** The Customer Terms version the person accepted; the control plane refuses any but the current one. */
  readonly accepted_customer_terms_version: number;
  readonly reservation_token?: string;
  /** Paid tiers only, and required there: the person's own choice, never a default. Free must not send it. */
  readonly overage_billing?: boolean;
}

export type CreateTenantResult =
  | { readonly kind: 'created'; readonly claimCode: string; readonly workspaceHost: string }
  | { readonly kind: 'checkout'; readonly checkoutUrl: string; readonly reservationToken: string | undefined };

export type TenantStatus =
  | { readonly status: 'pending' }
  | {
    readonly status: 'active';
    readonly claimCode: string | undefined;
    readonly workspaceHost: string | undefined;
    /** Undefined from a control plane that predates billing states. */
    readonly billing: TenantBilling | undefined;
  };

/** The only place a paid signup may be sent. Anything else in `checkout_url` is refused. */
export const CHECKOUT_ORIGIN: string = 'https://checkout.stripe.com';

/** The only place "Manage subscription" may send an owner. Anything else in `portal_url` is refused. */
export const PORTAL_ORIGIN: string = 'https://billing.stripe.com';

export interface ControlPlane {
  checkSlug(slug: string, signal?: AbortSignal): Promise<SlugAvailability>;
  createTenant(request: CreateTenantRequest): Promise<CreateTenantResult>;
  /** `sessionId` is the Checkout Session's, which collects the claim code once; undefined asks only the state. */
  tenantStatus(slug: string, sessionId: string | undefined, signal?: AbortSignal): Promise<TenantStatus>;
  /**
   * A Stripe Billing Portal address for `slug`, for the holder of its claim code. The terms version is
   * sent only after a `customer-terms-stale` refusal, once the person has accepted the current one.
   */
  openPortal(slug: string, claimCode: string, acceptedCustomerTermsVersion: number | undefined): Promise<string>;
  /** Every billing time limit and threshold, which the billing copy renders. */
  policy(): Promise<BillingPolicy>;
  /** This period's meters, for the holder of the claim code. */
  usage(slug: string, claimCode: string): Promise<UsageReport>;
  /** Turns overage billing on or off; resolves to the state the control plane now holds. */
  setOverageBilling(slug: string, claimCode: string, enabled: boolean): Promise<boolean>;
}

function parseAvailability(body: Record<string, unknown>): SlugAvailability {
  if (body.available === true) return { available: true };
  if (body.available !== false) throw malformed('availability');
  const reason: unknown = body.reason;
  const known: UnavailableReason | undefined =
    reason === 'invalid' || reason === 'reserved' || reason === 'taken' ? reason : undefined;
  return { available: false, reason: known };
}

function hasOrigin(candidate: string, origin: string): boolean {
  try {
    return new URL(candidate).origin === origin;
  } catch {
    return false;
  }
}

export function isCheckoutUrl(candidate: string): boolean {
  return hasOrigin(candidate, CHECKOUT_ORIGIN);
}

function parsePortal(body: Record<string, unknown>): string {
  const portalUrl: string | undefined = optionalString(body, 'portal_url');
  if (portalUrl === undefined || !hasOrigin(portalUrl, PORTAL_ORIGIN)) throw malformed('billing portal address');
  return portalUrl;
}

function parseCreated(body: Record<string, unknown>): CreateTenantResult {
  const checkoutUrl: string | undefined = optionalString(body, 'checkout_url');
  if (checkoutUrl !== undefined) {
    if (!isCheckoutUrl(checkoutUrl)) throw malformed('checkout address');
    return { kind: 'checkout', checkoutUrl, reservationToken: optionalString(body, 'reservation_token') };
  }
  const claimCode: string | undefined = optionalString(body, 'claim_code');
  const workspaceHost: string | undefined = optionalString(body, 'workspace_host');
  if (claimCode === undefined || workspaceHost === undefined) throw malformed('new workspace');
  return { kind: 'created', claimCode, workspaceHost };
}

function parseStatus(body: Record<string, unknown>): TenantStatus {
  if (body.status === 'pending') return { status: 'pending' };
  if (body.status !== 'active') throw malformed('status');
  const billing: TenantBilling | null | undefined = body.billing === undefined ? undefined : parseTenantBilling(body.billing);
  if (billing === null) throw malformed('billing state');
  return {
    status: 'active',
    claimCode: optionalString(body, 'claim_code'),
    workspaceHost: optionalString(body, 'workspace_host'),
    billing,
  };
}

function parseOverage(body: Record<string, unknown>): boolean {
  if (typeof body.overage_billing !== 'boolean') throw malformed('overage billing');
  return body.overage_billing;
}

export function createControlPlane(fetchFn: FetchLike, base: string): ControlPlane {
  return {
    async checkSlug(slug: string, signal?: AbortSignal): Promise<SlugAvailability> {
      const body: Record<string, unknown> = await send(fetchFn, `${base}/slug/${encodeURIComponent(slug)}`, {
        method: 'GET',
        signal,
      });
      return parseAvailability(body);
    },
    async createTenant(request: CreateTenantRequest): Promise<CreateTenantResult> {
      const body: Record<string, unknown> = await send(fetchFn, `${base}/tenants`, postJson(request));
      return parseCreated(body);
    },
    async tenantStatus(slug: string, sessionId: string | undefined, signal?: AbortSignal): Promise<TenantStatus> {
      const query: string = sessionId === undefined ? '' : `?${new URLSearchParams({ session_id: sessionId }).toString()}`;
      const body: Record<string, unknown> = await send(fetchFn, `${base}/tenants/${encodeURIComponent(slug)}/status${query}`, {
        method: 'GET',
        signal,
      });
      return parseStatus(body);
    },
    // Claim codes are the owner's proof: in the body, never the URL, where they
    // would reach logs, history and referrers.
    async openPortal(slug: string, claimCode: string, acceptedCustomerTermsVersion: number | undefined): Promise<string> {
      const accepted: Record<string, number> = acceptedCustomerTermsVersion === undefined
        ? {}
        : { accepted_customer_terms_version: acceptedCustomerTermsVersion };
      const body: Record<string, unknown> = await send(
        fetchFn,
        `${base}/tenants/${encodeURIComponent(slug)}/portal`,
        postJson({ claim_code: claimCode, ...accepted }),
      );
      return parsePortal(body);
    },
    async policy(): Promise<BillingPolicy> {
      const parsed: BillingPolicy | null = parseBillingPolicy(await send(fetchFn, `${base}/billing/policy`, { method: 'GET' }));
      if (parsed === null) throw malformed('billing policy');
      return parsed;
    },
    async usage(slug: string, claimCode: string): Promise<UsageReport> {
      const body: Record<string, unknown> = await send(
        fetchFn, `${base}/tenants/${encodeURIComponent(slug)}/usage`, postJson({ claim_code: claimCode }));
      const parsed: UsageReport | null = parseUsageReport(body);
      if (parsed === null) throw malformed('usage');
      return parsed;
    },
    async setOverageBilling(slug: string, claimCode: string, enabled: boolean): Promise<boolean> {
      return parseOverage(await send(
        fetchFn, `${base}/tenants/${encodeURIComponent(slug)}/overage`, postJson({ claim_code: claimCode, enabled })));
    },
  };
}
