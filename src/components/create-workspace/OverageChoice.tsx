import { useId, type JSX } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { PolicyLoad } from '@/hooks/use-billing-policy';
import { OVERAGE_OFF_LABEL, OVERAGE_ON_LABEL, changeNotice, overageCopy, type OverageOptionCopy } from '@/lib/billing/billing-copy';

export interface OverageChoiceProps {
  readonly load: PolicyLoad;
  readonly retry: () => void;
  /** Undefined until the person picks: there is no pre-selection, and Create waits for one. */
  readonly value: boolean | undefined;
  readonly onChange: (enabled: boolean) => void;
}

const KEY_ON: 'on' = 'on';
const KEY_OFF: 'off' = 'off';

function Option({ copy, itemValue }: { readonly copy: OverageOptionCopy | undefined; readonly itemValue: string }): JSX.Element {
  const id: string = useId();
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
      <RadioGroupItem id={id} value={itemValue} data-testid={`overage-${itemValue}`} aria-describedby={`${id}-details`} />
      <div className="min-w-0 space-y-1">
        <label htmlFor={id} className="block min-h-[24px] text-sm font-medium text-foreground">
          {copy?.label ?? (itemValue === KEY_ON ? OVERAGE_ON_LABEL : OVERAGE_OFF_LABEL)}
        </label>
        {copy && (
          <div id={`${id}-details`} className="space-y-1 text-sm text-muted-foreground">
            <p>{copy.summary}</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {copy.details.map((line: string) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The required overage-billing choice of a paid workspace. Both options are rendered from the
 * control plane's policy; until it has answered they are disabled, and if it fails its sentence
 * is shown instead of any guess at the numbers.
 */
export function OverageChoice({ load, retry, value, onChange }: OverageChoiceProps): JSX.Element {
  const ready: boolean = load.kind === 'ready';
  const on: OverageOptionCopy | undefined = load.kind === 'ready' ? overageCopy(load.policy, true) : undefined;
  const off: OverageOptionCopy | undefined = load.kind === 'ready' ? overageCopy(load.policy, false) : undefined;
  const notice: string | undefined = load.kind === 'ready' ? changeNotice(load.policy) : undefined;
  const selected: string = value === undefined ? '' : value ? KEY_ON : KEY_OFF;
  return (
    <fieldset className="mt-6 space-y-2" data-testid="overage-choice" aria-busy={load.kind === 'loading' || undefined}>
      <legend className="mb-2 text-sm font-medium text-foreground">Overage billing (choose one)</legend>
      {load.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading the billing terms…
        </p>
      )}
      {load.kind === 'failed' && (
        <div role="alert" data-testid="overage-policy-error" className="flex flex-wrap items-center gap-2 text-sm text-destructive-emphasis">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{load.message}</span>
          <Button type="button" variant="outline" size="sm" onClick={retry} className="min-h-[32px]" data-testid="overage-policy-retry">
            Try again
          </Button>
        </div>
      )}
      <RadioGroup
        value={selected}
        onValueChange={(next: string): void => onChange(next === KEY_ON)}
        disabled={!ready}
        aria-label="Overage billing"
      >
        <Option copy={on} itemValue={KEY_ON} />
        <Option copy={off} itemValue={KEY_OFF} />
      </RadioGroup>
      {notice !== undefined && <p className="text-xs text-muted-foreground" data-testid="overage-change-notice">{notice}</p>}
    </fieldset>
  );
}
