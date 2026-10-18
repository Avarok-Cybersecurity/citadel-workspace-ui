import { useState, type JSX } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ControlPlaneError, type ControlPlane } from '@/lib/onboarding/control-plane-client';
import type { PortalTab } from '@/lib/onboarding/billing-portal';
import type { UsageReport } from '@/lib/billing/billing-state';
import { useBillingPolicy, type BillingPolicyHandle } from '@/hooks/use-billing-policy';
import { usePortalOpener, type PortalOpener } from './use-portal-opener';
import { UsageMeters } from './UsageMeters';
import { OverageToggle } from './OverageToggle';
import { CustomerTermsReacceptance } from './CustomerTermsReacceptance';

export interface BillingPanelProps {
  readonly api: ControlPlane;
  readonly slug: string;
  /** Presented and accepted by `/usage`; held only while the dialog is open. */
  readonly claimCode: string;
  /** The meters, or why they could not be read (the portal is still offered). */
  readonly usage: { readonly kind: 'read'; readonly report: UsageReport } | { readonly kind: 'failed'; readonly message: string };
  readonly openTab: () => PortalTab | null;
}

/** What the claim-code holder sees: the meters, the overage switch, and the way into the portal. */
export function BillingPanel({ api, slug, claimCode, usage, openTab }: BillingPanelProps): JSX.Element {
  const [report, setReport] = useState<UsageReport | undefined>(usage.kind === 'read' ? usage.report : undefined);
  const policy: BillingPolicyHandle = useBillingPolicy(api, report !== undefined);
  const portal: PortalOpener = usePortalOpener(api, slug, claimCode, openTab);
  const { outcome } = portal;

  const setOverage = async (enabled: boolean): Promise<void> => {
    try {
      const held: boolean = await api.setOverageBilling(slug, claimCode, enabled);
      setReport((current: UsageReport | undefined) => current && { ...current, overageBilling: held });
    } catch (error: unknown) {
      throw new Error(error instanceof ControlPlaneError ? error.message : 'Overage billing could not be changed. Please try again.');
    }
  };

  return (
    <div className="space-y-5" data-testid="billing-panel">
      {usage.kind === 'failed' && <p role="alert" className="text-sm text-destructive-emphasis" data-testid="usage-error">{usage.message}</p>}
      {report && policy.load.kind === 'loading' && (
        <p role="status" className="text-sm text-muted-foreground">Loading the billing terms…</p>
      )}
      {report && policy.load.kind === 'failed' && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive-emphasis" data-testid="billing-policy-error">
          <span>{policy.load.message}</span>
          <Button type="button" variant="outline" size="sm" onClick={policy.retry} className="min-h-[32px]">Try again</Button>
        </div>
      )}
      {report && policy.load.kind === 'ready' && (
        <>
          <UsageMeters report={report} policy={policy.load.policy} nowSeconds={Math.floor(Date.now() / 1000)} />
          <OverageToggle enabled={report.overageBilling} policy={policy.load.policy} onConfirm={setOverage} />
        </>
      )}

      {outcome.kind === 'refused' && <p role="alert" className="text-sm text-destructive-emphasis">{outcome.refusal.message}</p>}
      {outcome.kind === 'terms-stale' && (
        <CustomerTermsReacceptance current={outcome.current} onAccepted={(version: number): void => { void portal.open(version); }} />
      )}
      {outcome.kind === 'opened' && (
        <p role="status" className="text-sm text-foreground">
          {outcome.blocked ? (
            <a href={outcome.portalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[24px] items-center gap-1 underline">
              Open billing portal <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : 'The billing portal opened in a new tab.'}
        </p>
      )}
      {outcome.kind !== 'opened' && outcome.kind !== 'terms-stale' && !(outcome.kind === 'refused' && !outcome.refusal.retry) && (
        <div className="flex justify-end">
          <Button type="button" disabled={outcome.kind === 'opening'} onClick={(): void => { void portal.open(undefined); }} className="min-h-[36px] gap-2">
            {outcome.kind === 'opening' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Manage subscription
          </Button>
        </div>
      )}
    </div>
  );
}
