/**
 * `/billing`: where a mailed billing link lands (control/portal.mjs).
 *
 * Once a workspace owner's email is verified, the claim code alone no longer opens billing; it
 * mails a single-use link, and this page spends it. Only on the press of "Open billing", never
 * on load, so a mail scanner that fetches the link cannot spend it first. The fragment is read
 * once and stripped from the address bar and history straight away.
 */
import { useState, type JSX } from 'react';
import { Button } from '@/components/ui/button';
import { CreateWorkspaceLayout } from '@/components/create-workspace/CreateWorkspaceLayout';
import { StepHeading } from '@/components/create-workspace/StepHeading';
import { createControlPlane, type ControlPlane } from '@/lib/onboarding/control-plane-client';
import { readControlPlaneBase } from '@/lib/onboarding/control-plane-config';
import { parseClaimLink, type ClaimLink } from '@/lib/onboarding/claim-link';
import { describePortalRefusal } from '@/lib/onboarding/billing-portal';
import { FORM_STEP_LABELS } from '@/lib/onboarding/create-flow';

type BillingLink = Extract<ClaimLink, { kind: 'billing' }>;

function takeLink(): BillingLink | null {
  const link: ClaimLink | null = parseClaimLink(window.location.hash);
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  return link?.kind === 'billing' ? link : null;
}

export function BillingLinkPage({ api, go }: { api: ControlPlane; go: (url: string) => void }): JSX.Element {
  const [link] = useState<BillingLink | null>(takeLink);
  const [state, setState] = useState<'idle' | 'working' | { refused: string }>('idle');

  if (link === null) {
    return (
      <CreateWorkspaceLayout stepNumber={undefined} stepLabels={FORM_STEP_LABELS}>
        <StepHeading title="This link cannot be used">
          It is incomplete or has been changed. Open the link from the email again, or ask for a new one from Plan &amp; billing.
        </StepHeading>
      </CreateWorkspaceLayout>
    );
  }

  const open = async (): Promise<void> => {
    setState('working');
    try {
      go(await api.openPortalByLink(link.slug, link.token));
    } catch (error: unknown) {
      setState({ refused: describePortalRefusal(error).message });
    }
  };
  return (
    <CreateWorkspaceLayout stepNumber={undefined} stepLabels={FORM_STEP_LABELS}>
      <StepHeading title="Manage billing">
        Open your workspace&apos;s billing in Stripe. This link works once.
      </StepHeading>
      {typeof state === 'object' ? (
        <p role="alert" className="text-sm text-destructive-emphasis" data-testid="billing-link-refused">{state.refused}</p>
      ) : (
        <Button onClick={() => { const _: Promise<void> = open(); }} disabled={state === 'working'} data-testid="billing-link-open">
          Open billing
        </Button>
      )}
    </CreateWorkspaceLayout>
  );
}

/** The `/billing` route, against the control plane this deployment publishes. */
export default function BillingLink(): JSX.Element {
  const [api] = useState<ControlPlane | undefined>(() => {
    const base: string | undefined = readControlPlaneBase(document);
    return base === undefined ? undefined : createControlPlane((input: string, init?: RequestInit): Promise<Response> => fetch(input, init), base);
  });
  if (api === undefined) {
    return (
      <CreateWorkspaceLayout stepNumber={undefined} stepLabels={FORM_STEP_LABELS}>
        <StepHeading title="Billing is not managed here">This Citadel site does not host workspaces.</StepHeading>
      </CreateWorkspaceLayout>
    );
  }
  return <BillingLinkPage api={api} go={(url: string): void => { window.location.assign(url); }} />;
}
