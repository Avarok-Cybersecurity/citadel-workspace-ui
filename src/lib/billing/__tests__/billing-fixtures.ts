/**
 * Control-plane billing answers, as the contract shapes them. The numbers are deliberately NOT
 * billing/policy.json's (37 h, 23 days): copy that shows them can only have read them from the
 * answer, never from a literal that happens to agree with production.
 */
export const CHANGE_NOTICE: string = 'Fixture notice: these limits may change, as the fixture says.';

export const POLICY_BODY: Record<string, unknown> = {
  overage_billing: {
    termination_ttl_hours: 37,
    terminated_service: {
      'relay-overage': 'Fixture: relay is refused.',
      'document-appends': 'Fixture: documents become read-only.',
      storage: 'Fixture: uploads are refused.',
    },
    data_deleted_on_termination: false,
  },
  dunning: { grace_days: 23, reminder_days: [0, 5], final_warning_hours: 11 },
  alerts: { usage_percent: [40, 90], overage_step_units: { 'relay-overage': 3 }, countdown_hours: [12, 0] },
  terms: { change_notice: CHANGE_NOTICE, effective_date: '2026-10-18' },
};

/** 2026-10-18 00:00 UTC, and offsets from it. */
export const T0: number = 1792281600;
export const HOUR: number = 3600;

export function usageBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    period: { start: T0, end: T0 + 30 * 24 * HOUR },
    overage_billing: false,
    dimensions: [
      { id: 'relay-overage', unit: 'GB', used: 12, included: 10, percent: 120, state: 'terminating', terminate_at: Math.floor(Date.now() / 1000) + 5 * HOUR + 60 },
      { id: 'document-appends', unit: 'thousand appends', used: 40, included: 100, percent: 40, state: 'none' },
      { id: 'storage', unit: 'GB', used: 9, included: 10, percent: 90, state: 'warn' },
    ],
    billing: { state: 'active' },
    ...overrides,
  };
}
