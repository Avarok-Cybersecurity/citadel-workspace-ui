import { useState, type JSX } from 'react';
import { CreditCard, PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManageSubscriptionDialog } from '@/components/layout/sidebar/ManageSubscriptionDialog';
import type { ControlPlane } from '@/lib/onboarding/control-plane-client';
import type { PortalTab } from '@/lib/onboarding/billing-portal';
import type { PaymentRequired } from '@/lib/billing/billing-state';
import { paymentRequiredCopy, type PaymentRequiredCopy } from '@/lib/billing/billing-copy';

export interface PaymentRequiredScreenProps {
  readonly slug: string;
  readonly refusal: PaymentRequired;
  /** Undefined on a page with no control plane: the owner is told where the invoice went, and nothing else. */
  readonly api: ControlPlane | undefined;
  readonly openTab: () => PortalTab | null;
}

/**
 * A workspace paused because a payment is required: since when, what is refused now, what
 * happens on the purge date, where the invoice went, and, for its owner, the way into billing
 * (the same claim-code flow as Plan & billing).
 */
export function PaymentRequiredScreen({ slug, refusal, api, openTab }: PaymentRequiredScreenProps): JSX.Element {
  const [billing, setBilling] = useState<boolean>(false);
  const copy: PaymentRequiredCopy = paymentRequiredCopy(refusal);
  return (
    <section
      role="alert" aria-labelledby="payment-required-title" data-testid="payment-required"
      className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground"
    >
      <h2 id="payment-required-title" className="flex items-center gap-2 text-base font-semibold">
        <PauseCircle className="h-5 w-5 shrink-0 text-destructive-emphasis" aria-hidden="true" />
        {copy.title}
      </h2>
      <p data-testid="payment-required-since">{copy.since}</p>
      <p data-testid="payment-required-now">{copy.refusedNow}</p>
      <p data-testid="payment-required-purge" className="font-medium">{copy.atPurge}</p>
      <p data-testid="payment-required-invoice">{copy.invoice}</p>
      {api !== undefined && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span>{copy.ownerPrompt}</span>
          <Button type="button" variant="outline" onClick={(): void => setBilling(true)} className="min-h-[36px] gap-2" data-testid="payment-required-open-billing">
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            Open billing
          </Button>
        </div>
      )}
      {api !== undefined && (
        <ManageSubscriptionDialog open={billing} onOpenChange={setBilling} slug={slug} api={api} openTab={openTab} />
      )}
    </section>
  );
}
