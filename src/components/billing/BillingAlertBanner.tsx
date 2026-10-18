import type { JSX } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { TenantBilling } from '@/lib/billing/billing-state';
import { alertBannerCopy } from '@/lib/billing/billing-copy';

export interface BillingAlertBannerProps {
  readonly billing: TenantBilling | undefined;
  readonly onOpenBilling: () => void;
}

/** The admin sidebar's billing banner: one sentence per level, and the way into Plan & billing. */
export function BillingAlertBanner({ billing, onOpenBilling }: BillingAlertBannerProps): JSX.Element | null {
  const sentence: string | undefined = billing === undefined ? undefined : alertBannerCopy(billing);
  if (billing === undefined || sentence === undefined) return null;
  const urgent: boolean = billing.billing.state === 'payment_required' || billing.alert === 'terminating' || billing.alert === 'terminated';
  return (
    <div
      role={urgent ? 'alert' : 'status'} data-testid="billing-alert" data-level={billing.billing.state === 'payment_required' ? 'payment_required' : billing.alert}
      className={`mx-3 mb-2 space-y-1.5 rounded-md border p-2 text-xs text-foreground ${urgent ? 'border-destructive/40 bg-destructive/10' : 'border-warning/40 bg-warning/10'}`}
    >
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{sentence}</span>
      </p>
      <button type="button" onClick={onOpenBilling} className="min-h-[24px] font-medium underline underline-offset-2" data-testid="billing-alert-open">
        Open Plan &amp; billing
      </button>
    </div>
  );
}
