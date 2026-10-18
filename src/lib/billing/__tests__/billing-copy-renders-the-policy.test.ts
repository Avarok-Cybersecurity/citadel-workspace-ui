// @vitest-environment node
/**
 * The billing copy shows the policy's numbers and sentences, and only those: the fixture's are not
 * production's, so a literal that happened to agree with policy.json would fail here.
 */
import { describe, it, expect } from 'vitest';
import { parseBillingPolicy, type BillingPolicy } from '../billing-policy';
import {
  alertBannerCopy,
  changeNotice,
  formatUtc,
  overageOffCopy,
  overageOnCopy,
  paymentRequiredCopy,
  terminationCountdown,
} from '../billing-copy';
import type { UsageDimension } from '../billing-state';
import { CHANGE_NOTICE, HOUR, POLICY_BODY, T0 } from './billing-fixtures';

const policy: BillingPolicy = ((): BillingPolicy => {
  const parsed: BillingPolicy | null = parseBillingPolicy(POLICY_BODY);
  if (parsed === null) throw new Error('fixture policy does not parse');
  return parsed;
})();

describe('the overage choice', () => {
  it('with overage billing: invoiced, and paused then deleted after the grace days', () => {
    expect(overageOnCopy(policy).summary).toMatch(/invoiced automatically/);
    expect(overageOnCopy(policy).details.join(' ')).toContain('after 23 days, deleted');
  });

  it('without: nothing billed, terminated after the TTL, each sentence from the policy, no data deleted', () => {
    const off: ReturnType<typeof overageOffCopy> = overageOffCopy(policy);
    expect(off.summary).toContain('terminated after 37 hours');
    expect(off.details).toEqual([
      'Relay traffic: Fixture: relay is refused.',
      'Document edits: Fixture: documents become read-only.',
      'Storage: Fixture: uploads are refused.',
      'No data is deleted.',
    ]);
  });

  it('says data is deleted if the policy ever says so', () => {
    const deleting: BillingPolicy = { ...policy, overageBilling: { ...policy.overageBilling, dataDeletedOnTermination: true } };
    expect(overageOffCopy(deleting).details.at(-1)).toBe('Data is deleted when a service is terminated.');
  });

  it('carries the control plane\'s change notice verbatim', () => {
    expect(changeNotice(policy)).toBe(CHANGE_NOTICE);
  });
});

describe('the pay screen', () => {
  it('names the pause and the purge in UTC', () => {
    const copy: ReturnType<typeof paymentRequiredCopy> = paymentRequiredCopy({ detail: undefined, since: T0, purgeAt: T0 + 30 * 24 * HOUR });
    expect(copy.since).toContain('October 18, 2026');
    expect(copy.atPurge).toBe(`On ${formatUtc(T0 + 30 * 24 * HOUR)}, the workspace's data is deleted.`);
    expect(formatUtc(T0)).toBe('October 18, 2026 at 00:00 UTC');
    expect(copy.refusedNow).toMatch(/nothing in the workspace can be read or written, and its relay is off/);
    expect(copy.invoice).toBe('The invoice link was emailed to the billing address.');
  });
});

describe('a meter\'s countdown', () => {
  const meter = (terminateAt: number | undefined): UsageDimension =>
    ({ id: 'relay-overage', unit: 'GB', used: 1, included: 1, percent: 100, state: 'terminating', terminateAt });

  it('counts whole hours down, then less than an hour, then says it happened', () => {
    expect(terminationCountdown(meter(T0 + 5 * HOUR + 60), T0)).toBe(`Terminates in 5 hours, on ${formatUtc(T0 + 5 * HOUR + 60)}.`);
    expect(terminationCountdown(meter(T0 + 60), T0)).toMatch(/^Terminates in less than an hour/);
    expect(terminationCountdown(meter(T0), T0)).toBe(`Terminated on ${formatUtc(T0)}.`);
    expect(terminationCountdown(meter(undefined), T0)).toBeUndefined();
  });
});

describe('the sidebar banner', () => {
  const at = (alert: 'none' | 'warn' | 'over' | 'terminating' | 'terminated', overageBilling: boolean = false): string | undefined =>
    alertBannerCopy({ billing: { state: 'active' }, alert, overageBilling });

  it('says nothing at none, and one sentence per level', () => {
    expect(at('none')).toBeUndefined();
    expect(at('warn')).toMatch(/nearing a limit/);
    expect(at('over', true)).toMatch(/billed as overage/);
    expect(at('over', false)).not.toMatch(/billed/);
    expect(at('terminating')).toMatch(/about to be terminated/);
    expect(at('terminated')).toMatch(/terminated until the billing period resets/);
  });

  it('puts payment above any level', () => {
    expect(alertBannerCopy({ billing: { state: 'payment_required', since: T0, purgeAt: T0 + 24 * HOUR }, alert: 'none', overageBilling: true }))
      .toBe('A payment is required: this workspace is paused, and its data is deleted on October 19, 2026.');
  });
});
