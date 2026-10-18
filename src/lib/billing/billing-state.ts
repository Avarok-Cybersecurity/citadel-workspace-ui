/**
 * Where a hosted workspace stands with billing, as the control plane says it:
 * the coarse state on `/status` and on a payment-required refusal, and the
 * full meters `/usage` gives the claim-code holder. Times are seconds since
 * the epoch, UTC. Each parser answers null for a shape the contract does not
 * promise; nothing is half-trusted.
 */
import { isRecord } from '@/lib/onboarding/control-plane-transport';

/** The coarse level on the public answers: no numbers, just how worried to be. */
export const ALERT_LEVELS: readonly ['none', 'warn', 'over', 'terminating', 'terminated'] =
  ['none', 'warn', 'over', 'terminating', 'terminated'];
export type AlertLevel = (typeof ALERT_LEVELS)[number];

export type BillingState =
  | { readonly state: 'active' }
  | { readonly state: 'payment_required'; readonly since: number; readonly purgeAt: number };

export interface TenantBilling {
  readonly billing: BillingState;
  readonly alert: AlertLevel;
  readonly overageBilling: boolean;
}

export interface UsageDimension {
  readonly id: string;
  readonly unit: string;
  readonly used: number;
  readonly included: number;
  readonly percent: number;
  readonly state: AlertLevel;
  readonly terminateAt: number | undefined;
}

export interface UsageReport {
  readonly period: { readonly start: number; readonly end: number };
  readonly overageBilling: boolean;
  readonly dimensions: readonly UsageDimension[];
  readonly billing: BillingState;
}

/** The 403 a paused workspace answers with, at discovery and at its host. */
export interface PaymentRequired {
  readonly detail: string | undefined;
  readonly since: number;
  readonly purgeAt: number;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isTime = (value: unknown): value is number => isNumber(value) && value > 0;
const isLevel = (value: unknown): value is AlertLevel => (ALERT_LEVELS as readonly unknown[]).includes(value);

export function parseBillingState(value: unknown): BillingState | null {
  if (!isRecord(value)) return null;
  if (value.state === 'active') return { state: 'active' };
  if (value.state !== 'payment_required' || !isTime(value.since) || !isTime(value.purge_at)) return null;
  return { state: 'payment_required', since: value.since, purgeAt: value.purge_at };
}

/** `/status`'s `billing`: the state, the alert level and the toggle together. */
export function parseTenantBilling(value: unknown): TenantBilling | null {
  const billing: BillingState | null = parseBillingState(value);
  if (billing === null || !isRecord(value)) return null;
  if (!isLevel(value.alert) || typeof value.overage_billing !== 'boolean') return null;
  return { billing, alert: value.alert, overageBilling: value.overage_billing };
}

function parseDimension(value: unknown): UsageDimension | null {
  if (!isRecord(value)) return null;
  const { id, unit, used, included, percent, state, terminate_at: terminateAt } = value;
  if (typeof id !== 'string' || id.length === 0 || typeof unit !== 'string') return null;
  if (!isNumber(used) || !isNumber(included) || !isNumber(percent) || !isLevel(state)) return null;
  if (terminateAt !== undefined && terminateAt !== null && !isTime(terminateAt)) return null;
  return { id, unit, used, included, percent, state, terminateAt: isTime(terminateAt) ? terminateAt : undefined };
}

export function parseUsageReport(body: unknown): UsageReport | null {
  if (!isRecord(body) || !isRecord(body.period) || !Array.isArray(body.dimensions)) return null;
  const { start, end } = body.period;
  const billing: BillingState | null = parseBillingState(body.billing);
  if (!isTime(start) || !isTime(end) || billing === null || typeof body.overage_billing !== 'boolean') return null;
  const dimensions: Array<UsageDimension | null> = body.dimensions.map(parseDimension);
  if (dimensions.some((d: UsageDimension | null) => d === null)) return null;
  return {
    period: { start, end },
    overageBilling: body.overage_billing,
    dimensions: dimensions as UsageDimension[],
    billing,
  };
}

/** A payment-required refusal's body, or null for any other refusal. */
export function parsePaymentRequired(body: unknown): PaymentRequired | null {
  if (!isRecord(body) || body.error !== 'payment-required') return null;
  const billing: BillingState | null = parseBillingState(body.billing);
  if (billing === null || billing.state !== 'payment_required') return null;
  const detail: string | undefined = typeof body.detail === 'string' && body.detail.length > 0 ? body.detail : undefined;
  return { detail, since: billing.since, purgeAt: billing.purgeAt };
}
