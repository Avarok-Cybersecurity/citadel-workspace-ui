import type { JSX } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  MAX_STORAGE_BLOCKS,
  STORAGE_ADDON,
  clampSeats,
  clampStorageBlocks,
  formatUsd,
  isPaid,
  monthsFreeOnYearly,
  quote,
  tierById,
  type BillingInterval,
  type PlanSelection,
  type Quote,
  type TierId,
} from '@/lib/onboarding/tiers';
import { NumberStepper } from './NumberStepper';
import { PlanCards } from './PlanCards';
import { StepHeading } from './StepHeading';

export interface PlanStepProps {
  readonly plan: PlanSelection;
  readonly onChange: (plan: PlanSelection) => void;
  readonly onBack: () => void;
  readonly onContinue: () => void;
}

export const INTERVAL_NAME: Readonly<Record<BillingInterval, string>> = { month: 'month', year: 'year' };

function IntervalToggle({ interval, onChange }: { readonly interval: BillingInterval; readonly onChange: (i: BillingInterval) => void }): JSX.Element {
  const saving: number = monthsFreeOnYearly('team');
  const options: ReadonlyArray<readonly [BillingInterval, string]> = [
    ['month', 'Monthly'],
    ['year', `Yearly · ${saving} months free`],
  ];
  return (
    <fieldset className="mb-5 flex justify-center">
      <legend className="sr-only">Billing interval</legend>
      <div className="inline-flex rounded-full border border-border bg-background p-1">
        {options.map(([value, label]) => (
          <label
            key={value}
            data-testid={`interval-${value}`}
            className={cn(
              'cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring',
              interval === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <input
              type="radio"
              name="interval"
              value={value}
              checked={interval === value}
              onChange={() => onChange(value)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Step 2: which plan, how many seats, how much extra storage -- and what that costs. */
export function PlanStep({ plan, onChange, onBack, onContinue }: PlanStepProps): JSX.Element {
  const paid: boolean = isPaid(plan.tier);
  const q: Quote = quote(plan);
  const per: string = INTERVAL_NAME[plan.interval];

  const selectTier = (tier: TierId): void =>
    onChange({
      ...plan,
      tier,
      seats: isPaid(tier) ? clampSeats(tier, plan.seats) : plan.seats,
      storageBlocks: clampStorageBlocks(tier, plan.storageBlocks),
    });

  return (
    <div>
      <StepHeading title="Choose a plan">Start free, or pay per seat as your team grows.</StepHeading>

      <IntervalToggle interval={plan.interval} onChange={(interval) => onChange({ ...plan, interval })} />
      <PlanCards selected={plan.tier} interval={plan.interval} onSelect={selectTier} />

      {paid && (
        <div className="mt-6 grid gap-4 rounded-xl border border-border bg-background p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="plan-seats" className="block text-sm font-medium text-foreground">Seats</label>
            <NumberStepper
              id="plan-seats"
              label="seats"
              testId="plan-seats"
              value={clampSeats(plan.tier, plan.seats)}
              min={1}
              max={tierById(plan.tier).maxMembers}
              onChange={(seats) => onChange({ ...plan, seats })}
            />
            <p className="text-xs text-muted-foreground">One per member. Up to {tierById(plan.tier).maxMembers.toLocaleString('en-US')}.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="plan-storage" className="block text-sm font-medium text-foreground">Extra storage</label>
            <NumberStepper
              id="plan-storage"
              label={`${STORAGE_ADDON.gbPerBlock} GB storage blocks`}
              testId="plan-storage"
              value={plan.storageBlocks}
              min={0}
              max={MAX_STORAGE_BLOCKS}
              onChange={(storageBlocks) => onChange({ ...plan, storageBlocks })}
            />
            <p className="text-xs text-muted-foreground">
              {STORAGE_ADDON.gbPerBlock} GB blocks, {formatUsd(STORAGE_ADDON.unitAmount[plan.interval])} each per {per}.
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl bg-muted px-4 py-4" data-testid="plan-total" aria-live="polite">
        {paid ? (
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>{clampSeats(plan.tier, plan.seats)} × {tierById(plan.tier).name} seat</dt>
              <dd className="tabular-nums">{formatUsd(q.seatsCents)}</dd>
            </div>
            {plan.storageBlocks > 0 && (
              <div className="flex justify-between gap-4 text-muted-foreground">
                <dt>{plan.storageBlocks} × {STORAGE_ADDON.gbPerBlock} GB storage</dt>
                <dd className="tabular-nums">{formatUsd(q.storageCents)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold text-foreground">
              <dt>Total</dt>
              <dd className="tabular-nums" data-testid="plan-total-amount">{formatUsd(q.totalCents)} / {per}</dd>
            </div>
          </dl>
        ) : (
          <p className="flex justify-between text-base font-semibold text-foreground">
            <span>Total</span>
            <span data-testid="plan-total-amount">Free</span>
          </p>
        )}
        <p className="pt-1 text-xs text-muted-foreground">
          {q.storageGb.toLocaleString('en-US')} GB storage in total.{paid && ' Paid securely through Stripe Checkout.'}
        </p>
      </div>

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row justify-between">
        <Button type="button" variant="ghost" size="lg" onClick={onBack} className="h-11 gap-2">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Button>
        <Button type="button" size="lg" onClick={onContinue} data-testid="create-plan-continue" className="h-11 gap-2">
          Continue
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
