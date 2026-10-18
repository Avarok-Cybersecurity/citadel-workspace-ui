/**
 * The billing policy as `GET /api/billing/policy` serves it: the one source of
 * every time limit and threshold the UI's billing copy renders (the parent
 * repository's billing/policy.json). Nothing here has a default: an answer
 * missing any key is no policy at all, and the caller shows the error.
 */
import { isRecord } from '@/lib/onboarding/control-plane-transport';

/** The three metered dimensions, as the control plane names them. */
export const DIMENSION_IDS: readonly ['relay-overage', 'document-appends', 'storage'] =
  ['relay-overage', 'document-appends', 'storage'];
export type DimensionId = (typeof DIMENSION_IDS)[number];

export interface BillingPolicy {
  readonly overageBilling: {
    readonly terminationTtlHours: number;
    /** What "terminated" means for each dimension: a sentence for people. */
    readonly terminatedService: Readonly<Record<DimensionId, string>>;
    readonly dataDeletedOnTermination: boolean;
  };
  readonly dunning: {
    readonly graceDays: number;
    readonly reminderDays: readonly number[];
    readonly finalWarningHours: number;
  };
  readonly alerts: {
    readonly usagePercent: readonly number[];
    readonly overageStepUnits: Readonly<Record<string, number>>;
    readonly countdownHours: readonly number[];
  };
  /** `changeNotice` is shown verbatim beneath every rendering of these limits. */
  readonly terms: { readonly changeNotice: string; readonly effectiveDate: string };
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function counts(value: unknown): readonly number[] | null {
  return Array.isArray(value) && value.every(isCount) ? value : null;
}

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

function sentence(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function terminatedService(value: unknown): Record<DimensionId, string> | null {
  if (!isRecord(value)) return null;
  const relay: string | null = sentence(value['relay-overage']);
  const appends: string | null = sentence(value['document-appends']);
  const storage: string | null = sentence(value.storage);
  if (relay === null || appends === null || storage === null) return null;
  return { 'relay-overage': relay, 'document-appends': appends, storage };
}

function stepUnits(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const entries: Array<[string, unknown]> = Object.entries(value).filter(([key]: [string, unknown]) => !key.startsWith('$'));
  if (!entries.every(([, units]: [string, unknown]) => isCount(units) && units > 0)) return null;
  return Object.fromEntries(entries) as Record<string, number>;
}

/** The policy, or null when any key is missing or of the wrong kind. */
export function parseBillingPolicy(body: unknown): BillingPolicy | null {
  if (!isRecord(body)) return null;
  const { overage_billing: overage, dunning, alerts, terms } = body;
  if (!isRecord(overage) || !isRecord(dunning) || !isRecord(alerts) || !isRecord(terms)) return null;
  const service: Record<DimensionId, string> | null = terminatedService(overage.terminated_service);
  const reminders: readonly number[] | null = counts(dunning.reminder_days);
  const percents: readonly number[] | null = counts(alerts.usage_percent);
  const countdown: readonly number[] | null = counts(alerts.countdown_hours);
  const steps: Record<string, number> | null = stepUnits(alerts.overage_step_units);
  const notice: string | null = sentence(terms.change_notice);
  const effective: unknown = terms.effective_date;
  if (
    service === null || reminders === null || percents === null || countdown === null || steps === null ||
    !isCount(overage.termination_ttl_hours) || typeof overage.data_deleted_on_termination !== 'boolean' ||
    !isCount(dunning.grace_days) || !isCount(dunning.final_warning_hours) ||
    notice === null || !isIsoDate(effective)
  ) {
    return null;
  }
  return {
    overageBilling: {
      terminationTtlHours: overage.termination_ttl_hours,
      terminatedService: service,
      dataDeletedOnTermination: overage.data_deleted_on_termination,
    },
    dunning: { graceDays: dunning.grace_days, reminderDays: reminders, finalWarningHours: dunning.final_warning_hours },
    alerts: { usagePercent: percents, overageStepUnits: steps, countdownHours: countdown },
    terms: { changeNotice: notice, effectiveDate: effective },
  };
}
