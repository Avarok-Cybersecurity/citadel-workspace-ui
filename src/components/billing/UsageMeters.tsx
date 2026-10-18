import type { JSX } from 'react';
import { Badge } from '@/components/ui/badge';
import type { BillingPolicy } from '@/lib/billing/billing-policy';
import type { AlertLevel, UsageDimension, UsageReport } from '@/lib/billing/billing-state';
import {
  STATE_BADGES,
  dimensionName,
  formatUtcDate,
  terminatedServiceSentence,
  terminationCountdown,
} from '@/lib/billing/billing-copy';

const BADGE_TONE: Readonly<Record<AlertLevel, string>> = {
  none: 'bg-muted text-foreground',
  warn: 'bg-warning text-warning-foreground',
  over: 'bg-warning text-warning-foreground',
  terminating: 'bg-destructive text-destructive-foreground',
  terminated: 'bg-destructive text-destructive-foreground',
};

/** Whether a meter should say what terminating it means: the toggle is off, or it is happening. */
function explainsTermination(report: UsageReport, dimension: UsageDimension): boolean {
  return !report.overageBilling || dimension.state === 'terminating' || dimension.state === 'terminated';
}

function Meter({ report, dimension, policy, nowSeconds }: {
  readonly report: UsageReport;
  readonly dimension: UsageDimension;
  readonly policy: BillingPolicy;
  readonly nowSeconds: number;
}): JSX.Element {
  const name: string = dimensionName(dimension.id);
  const shown: number = Math.max(0, Math.min(100, Math.round(dimension.percent)));
  const countdown: string | undefined = terminationCountdown(dimension, nowSeconds);
  const terminates: string | undefined = explainsTermination(report, dimension)
    ? terminatedServiceSentence(policy, dimension.id)
    : undefined;
  return (
    <li className="space-y-1.5" data-testid={`usage-${dimension.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{name}</span>
        <Badge className={BADGE_TONE[dimension.state]} data-testid={`usage-${dimension.id}-state`}>{STATE_BADGES[dimension.state]}</Badge>
      </div>
      <div
        role="progressbar" aria-label={`${name} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary" style={{ width: `${shown}%` }} />
      </div>
      <p className="text-xs text-muted-foreground" data-testid={`usage-${dimension.id}-amount`}>
        {`${dimension.used} of ${dimension.included} ${dimension.unit} (${Math.round(dimension.percent)}%)`}
      </p>
      {countdown && <p className="text-xs font-medium text-destructive-emphasis" data-testid={`usage-${dimension.id}-countdown`}>{countdown}</p>}
      {terminates && <p className="text-xs text-muted-foreground" data-testid={`usage-${dimension.id}-terminates`}>{`At the limit: ${terminates}`}</p>}
    </li>
  );
}

/** This period's meters, one per dimension, each with what crossing it means under the policy. */
export function UsageMeters({ report, policy, nowSeconds }: {
  readonly report: UsageReport;
  readonly policy: BillingPolicy;
  readonly nowSeconds: number;
}): JSX.Element {
  return (
    <section aria-label="Usage this period" className="space-y-3" data-testid="usage-meters">
      <p className="text-xs text-muted-foreground">
        {`This period: ${formatUtcDate(report.period.start)} to ${formatUtcDate(report.period.end)}`}
      </p>
      <ul className="space-y-4">
        {report.dimensions.map((dimension: UsageDimension) => (
          <Meter key={dimension.id} report={report} dimension={dimension} policy={policy} nowSeconds={nowSeconds} />
        ))}
      </ul>
    </section>
  );
}
