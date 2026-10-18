import { useState, type FormEvent } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ControlPlaneError, type ControlPlane } from '@/lib/onboarding/control-plane-client';
import type { UsageReport } from '@/lib/billing/billing-state';
import { BillingPanel, type BillingPanelProps } from '@/components/billing/BillingPanel';
import { describePortalRefusal, type PortalRefusal, type PortalTab } from '@/lib/onboarding/billing-portal';

interface ManageSubscriptionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly slug: string;
  readonly api: ControlPlane;
  /** Opens an empty tab, or returns null when the browser refused one. */
  readonly openTab: () => PortalTab | null;
}

type Stage =
  | { readonly kind: 'code' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'refused'; readonly refusal: PortalRefusal }
  | { readonly kind: 'panel'; readonly claimCode: string; readonly usage: BillingPanelProps['usage'] };

const CODE: Stage = { kind: 'code' };

/**
 * "Plan & billing": the owner proves ownership with the workspace's claim code, then sees this
 * period's meters, the overage-billing switch and the way into the Stripe billing portal.
 *
 * The code is typed into a password field, which is cleared the moment it is presented. Once the
 * control plane has accepted it, it is held in this component's state for the panel's requests and
 * dropped when the dialog closes. It is never logged and never stored.
 */
export function ManageSubscriptionDialog({ open, onOpenChange, slug, api, openTab }: ManageSubscriptionDialogProps): JSX.Element {
  const [claimCode, setClaimCode] = useState<string>('');
  const [stage, setStage] = useState<Stage>(CODE);

  const close = (next: boolean): void => {
    if (!next) {
      setClaimCode('');
      setStage(CODE);
    }
    onOpenChange(next);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const presented: string = claimCode.trim();
    if (presented.length === 0 || stage.kind === 'checking') return;
    setStage({ kind: 'checking' });
    setClaimCode('');
    try {
      const report: UsageReport = await api.usage(slug, presented);
      setStage({ kind: 'panel', claimCode: presented, usage: { kind: 'read', report } });
    } catch (error: unknown) {
      const refusal: PortalRefusal = describePortalRefusal(error);
      // A wrong code, or a refusal that no retry changes, ends here; any other failure to read the
      // meters still leaves the portal to the person who holds the code.
      const toPanel: boolean = !(error instanceof ControlPlaneError && error.code === 'not-owner') && refusal.retry;
      setStage(toPanel ? { kind: 'panel', claimCode: presented, usage: { kind: 'failed', message: refusal.message } } : { kind: 'refused', refusal });
    }
  };

  const finalRefusal: boolean = stage.kind === 'refused' && !stage.refusal.retry;
  const busy: boolean = stage.kind === 'checking';

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="bg-surface max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <CreditCard className="h-5 w-5" aria-hidden="true" />
            Plan & billing
          </DialogTitle>
          <DialogDescription>
            See this period&apos;s usage, choose overage billing, and change or cancel the plan in the Stripe
            billing portal. Enter the claim code you were given when the workspace was created to prove you own it.
          </DialogDescription>
        </DialogHeader>

        {stage.kind === 'refused' && (
          <p role="alert" className="text-sm text-destructive">{stage.refusal.message}</p>
        )}

        {stage.kind === 'panel' && (
          <BillingPanel api={api} slug={slug} claimCode={stage.claimCode} usage={stage.usage} openTab={openTab} />
        )}

        {!finalRefusal && stage.kind !== 'panel' && (
          <form onSubmit={(e: FormEvent<HTMLFormElement>): void => { void submit(e); }} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="billing-claim-code">Claim code</Label>
              <Input
                id="billing-claim-code"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={claimCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>): void => setClaimCode(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy || claimCode.trim().length === 0} className="gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Continue
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
