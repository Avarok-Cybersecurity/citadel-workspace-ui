// @vitest-environment node
/**
 * Every billing answer is parsed against the contract, and a shape it does not promise is no
 * answer at all (null), never a half-read one with defaults filled in.
 */
import { describe, it, expect } from 'vitest';
import { parseBillingPolicy, type BillingPolicy } from '../billing-policy';
import { parsePaymentRequired, parseTenantBilling, parseUsageReport } from '../billing-state';
import { CHANGE_NOTICE, POLICY_BODY, T0, usageBody } from './billing-fixtures';

const clone = (value: Record<string, unknown>): Record<string, unknown> => structuredClone(value);

function without(path: readonly string[]): Record<string, unknown> {
  const body: Record<string, unknown> = clone(POLICY_BODY);
  let at: Record<string, unknown> = body;
  path.slice(0, -1).forEach((key: string) => { at = at[key] as Record<string, unknown>; });
  delete at[path[path.length - 1]];
  return body;
}

describe('the billing policy', () => {
  it('reads every key', () => {
    const policy: BillingPolicy | null = parseBillingPolicy(POLICY_BODY);
    expect(policy?.overageBilling.terminationTtlHours).toBe(37);
    expect(policy?.overageBilling.terminatedService.storage).toBe('Fixture: uploads are refused.');
    expect(policy?.dunning.graceDays).toBe(23);
    expect(policy?.alerts.overageStepUnits).toEqual({ 'relay-overage': 3 });
    expect(policy?.terms).toEqual({ changeNotice: CHANGE_NOTICE, effectiveDate: '2026-10-18' });
  });

  it.each([
    ['overage_billing', 'termination_ttl_hours'],
    ['overage_billing', 'terminated_service', 'document-appends'],
    ['overage_billing', 'data_deleted_on_termination'],
    ['dunning', 'grace_days'],
    ['dunning', 'reminder_days'],
    ['dunning', 'final_warning_hours'],
    ['alerts', 'usage_percent'],
    ['alerts', 'overage_step_units'],
    ['alerts', 'countdown_hours'],
    ['terms', 'change_notice'],
    ['terms', 'effective_date'],
  ])('is no policy without %s.%s', (...path: string[]) => {
    expect(parseBillingPolicy(without(path))).toBeNull();
  });

  it('refuses the old terms shape, a non-date and a negative TTL', () => {
    expect(parseBillingPolicy({ ...clone(POLICY_BODY), terms: { change_without_notice: true } })).toBeNull();
    expect(parseBillingPolicy({ ...clone(POLICY_BODY), terms: { change_notice: 'x', effective_date: 'soon' } })).toBeNull();
    const negative: Record<string, unknown> = clone(POLICY_BODY);
    (negative.overage_billing as Record<string, unknown>).termination_ttl_hours = -1;
    expect(parseBillingPolicy(negative)).toBeNull();
  });
});

describe('billing state', () => {
  it('reads the coarse level on /status, and refuses an unknown one', () => {
    expect(parseTenantBilling({ state: 'active', alert: 'warn', overage_billing: true }))
      .toEqual({ billing: { state: 'active' }, alert: 'warn', overageBilling: true });
    expect(parseTenantBilling({ state: 'payment_required', since: T0, purge_at: T0 + 1, alert: 'none', overage_billing: true }))
      .toEqual({ billing: { state: 'payment_required', since: T0, purgeAt: T0 + 1 }, alert: 'none', overageBilling: true });
    expect(parseTenantBilling({ state: 'active', alert: 'panic', overage_billing: true })).toBeNull();
    expect(parseTenantBilling({ state: 'active', alert: 'warn' })).toBeNull();
    expect(parseTenantBilling({ state: 'payment_required', alert: 'none', overage_billing: true })).toBeNull();
  });

  it('reads the meters, and refuses one meter that is wrong', () => {
    expect(parseUsageReport(usageBody())?.dimensions.map((d) => d.state)).toEqual(['terminating', 'none', 'warn']);
    expect(parseUsageReport(usageBody())?.dimensions[1].terminateAt).toBeUndefined();
    const bad: Record<string, unknown> = usageBody();
    (bad.dimensions as Array<Record<string, unknown>>)[2].state = 'mostly-fine';
    expect(parseUsageReport(bad)).toBeNull();
    const badTime: Record<string, unknown> = usageBody();
    (badTime.dimensions as Array<Record<string, unknown>>)[0].terminate_at = 'tomorrow';
    expect(parseUsageReport(badTime)).toBeNull();
    expect(parseUsageReport(usageBody({ overage_billing: 'yes' }))).toBeNull();
  });

  it('reads only a payment-required refusal that says when', () => {
    const body: Record<string, unknown> = { error: 'payment-required', detail: 'pay', billing: { state: 'payment_required', since: T0, purge_at: T0 + 9 } };
    expect(parsePaymentRequired(body)).toEqual({ detail: 'pay', since: T0, purgeAt: T0 + 9 });
    expect(parsePaymentRequired({ ...body, error: 'suspended' })).toBeNull();
    expect(parsePaymentRequired({ ...body, billing: { state: 'active' } })).toBeNull();
    expect(parsePaymentRequired({ ...body, billing: { state: 'payment_required', since: T0 } })).toBeNull();
  });
});
