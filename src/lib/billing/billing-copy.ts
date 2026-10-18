/**
 * Every billing sentence a person reads, rendered from the policy the control
 * plane serves and from the state it reports. No number in this file is a
 * policy value: grace days, TTLs and what terminates all come from the
 * `BillingPolicy` handed in, so the copy cannot drift from what is enforced.
 */
import type { BillingPolicy, DimensionId } from './billing-policy';
import { DIMENSION_IDS } from './billing-policy';
import type { AlertLevel, PaymentRequired, TenantBilling, UsageDimension } from './billing-state';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "October 18, 2026 at 14:00 UTC": seconds since the epoch, always in UTC, so every reader sees one time. */
export function formatUtc(seconds: number): string {
  const text: string = new Date(seconds * 1000).toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
  });
  return `${text} UTC`;
}

export function formatUtcDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

const DIMENSION_NAMES: Readonly<Record<DimensionId, string>> = {
  'relay-overage': 'Relay traffic',
  'document-appends': 'Document edits',
  storage: 'Storage',
};

const isDimensionId = (id: string): id is DimensionId => (DIMENSION_IDS as readonly string[]).includes(id);

/** The name a meter is shown under; an id this page does not know is shown as itself. */
export function dimensionName(id: string): string {
  return isDimensionId(id) ? DIMENSION_NAMES[id] : id;
}

/** What terminating `id` means, from the policy; undefined for a dimension the policy does not name. */
export function terminatedServiceSentence(policy: BillingPolicy, id: string): string | undefined {
  return isDimensionId(id) ? policy.overageBilling.terminatedService[id] : undefined;
}

export interface OverageOptionCopy {
  readonly label: string;
  readonly summary: string;
  /** The per-dimension consequences, one sentence each. */
  readonly details: readonly string[];
}

/** The control plane's own sentence about changes to these limits, verbatim. */
export function changeNotice(policy: BillingPolicy): string {
  return policy.terms.changeNotice;
}

export const OVERAGE_ON_LABEL: string = 'Enable overage billing';
export const OVERAGE_OFF_LABEL: string = 'No overage billing';

export function overageOnCopy(policy: BillingPolicy): OverageOptionCopy {
  return {
    label: OVERAGE_ON_LABEL,
    summary: 'Use beyond what the plan includes is metered and invoiced automatically.',
    details: [
      `If a payment fails, the workspace is paused and, after ${plural(policy.dunning.graceDays, 'day', 'days')}, deleted.`,
    ],
  };
}

export function overageOffCopy(policy: BillingPolicy): OverageOptionCopy {
  const ttl: string = plural(policy.overageBilling.terminationTtlHours, 'hour', 'hours');
  return {
    label: OVERAGE_OFF_LABEL,
    summary: `Nothing beyond the plan is ever billed. When a quota is crossed, that service is terminated after ${ttl}, until the billing period resets.`,
    details: [
      ...DIMENSION_IDS.map((id: DimensionId) => `${DIMENSION_NAMES[id]}: ${policy.overageBilling.terminatedService[id]}`),
      policy.overageBilling.dataDeletedOnTermination
        ? 'Data is deleted when a service is terminated.'
        : 'No data is deleted.',
    ],
  };
}

export function overageCopy(policy: BillingPolicy, enabled: boolean): OverageOptionCopy {
  return enabled ? overageOnCopy(policy) : overageOffCopy(policy);
}

export interface PaymentRequiredCopy {
  readonly title: string;
  readonly since: string;
  readonly refusedNow: string;
  readonly atPurge: string;
  readonly invoice: string;
  readonly ownerPrompt: string;
}

export function paymentRequiredCopy(refusal: PaymentRequired): PaymentRequiredCopy {
  return {
    title: 'This workspace is paused',
    since: `It has been paused since ${formatUtc(refusal.since)} because a payment is required.`,
    refusedNow: 'Until it is paid, nothing in the workspace can be read or written, and its relay is off.',
    atPurge: `On ${formatUtc(refusal.purgeAt)}, the workspace's data is deleted.`,
    invoice: 'The invoice link was emailed to the billing address.',
    ownerPrompt: 'If you own this workspace:',
  };
}

export const STATE_BADGES: Readonly<Record<AlertLevel, string>> = {
  none: 'Within plan',
  warn: 'Nearing limit',
  over: 'Over plan',
  terminating: 'Terminating',
  terminated: 'Terminated',
};

/** "Terminates in 23 hours, on …" or "Terminated on …"; undefined when the meter has no termination. */
export function terminationCountdown(dimension: UsageDimension, nowSeconds: number): string | undefined {
  if (dimension.terminateAt === undefined) return undefined;
  const at: string = formatUtc(dimension.terminateAt);
  const left: number = dimension.terminateAt - nowSeconds;
  if (left <= 0) return `Terminated on ${at}.`;
  const hours: number = Math.floor(left / 3600);
  const remaining: string = hours >= 1 ? plural(hours, 'hour', 'hours') : 'less than an hour';
  return `Terminates in ${remaining}, on ${at}.`;
}

/** The sidebar banner's sentence for an admin, or undefined when there is nothing to say. */
export function alertBannerCopy(status: TenantBilling): string | undefined {
  if (status.billing.state === 'payment_required') {
    return `A payment is required: this workspace is paused, and its data is deleted on ${formatUtcDate(status.billing.purgeAt)}.`;
  }
  switch (status.alert) {
    case 'none': return undefined;
    case 'warn': return 'This workspace is nearing a limit of its plan.';
    case 'over': return status.overageBilling
      ? 'This workspace is over its plan; the extra is billed as overage.'
      : 'This workspace is over a limit of its plan.';
    case 'terminating': return 'A service in this workspace is about to be terminated: a quota was crossed.';
    case 'terminated': return 'A service in this workspace is terminated until the billing period resets.';
  }
}
