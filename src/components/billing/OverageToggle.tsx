import { useId, useState, type JSX } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { BillingPolicy } from '@/lib/billing/billing-policy';
import { OVERAGE_ON_LABEL, changeNotice, overageCopy, type OverageOptionCopy } from '@/lib/billing/billing-copy';

export interface OverageToggleProps {
  readonly enabled: boolean;
  readonly policy: BillingPolicy;
  /** Resolves when the control plane holds the new state; rejects with the sentence to show. */
  readonly onConfirm: (enabled: boolean) => Promise<void>;
}

/**
 * "Enable overage billing", changed by the claim-code holder. Flipping the switch changes nothing
 * yet: it puts the consequences of the new state, rendered from the policy, in front of the
 * person, and only Confirm sends it.
 */
export function OverageToggle({ enabled, policy, onConfirm }: OverageToggleProps): JSX.Element {
  const [pending, setPending] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const switchId: string = useId();
  const copy: OverageOptionCopy | undefined = pending === undefined ? undefined : overageCopy(policy, pending);

  const confirm = async (): Promise<void> => {
    if (pending === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm(pending);
      setPending(undefined);
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'Overage billing could not be changed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2" data-testid="overage-toggle">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={switchId} className="text-sm font-medium text-foreground">{OVERAGE_ON_LABEL}</label>
        <Switch
          id={switchId} data-testid="overage-switch" checked={pending ?? enabled} disabled={busy}
          onCheckedChange={(next: boolean): void => { setError(undefined); setPending(next === enabled ? undefined : next); }}
        />
      </div>
      {copy && (
        <div className="space-y-2 rounded-lg border border-border bg-background p-3" data-testid="overage-confirm">
          <p className="text-sm font-medium text-foreground">{`Switch to "${copy.label}"?`}</p>
          <p className="text-sm text-muted-foreground">{copy.summary}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
            {copy.details.map((line: string) => <li key={line}>{line}</li>)}
          </ul>
          <p className="text-xs text-muted-foreground">{changeNotice(policy)}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={(): void => setPending(undefined)} className="min-h-[36px]" data-testid="overage-cancel">
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={(): void => { void confirm(); }} className="min-h-[36px] gap-2" data-testid="overage-confirm-button">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirm
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive-emphasis" data-testid="overage-error">{error}</p>}
    </section>
  );
}
