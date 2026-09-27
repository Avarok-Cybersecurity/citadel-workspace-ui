/**
 * `/claim`: where the claim email's links land.
 *
 * - A claim link opens the claim step with the code already filled in, recorded for the setup
 *   modal to prefill (claim-handoff), so one press claims. Pressing "Open your workspace" is
 *   also what confirms the email address. Never on page load, so a mail scanner that fetches the
 *   link cannot confirm it for them.
 * - A "this wasn't me" link asks once, then forgets the address.
 *
 * The fragment is read once and stripped from the address bar and history straight away.
 */
import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router';
import { Button } from '@/components/ui/button';
import { ClaimStep } from '@/components/create-workspace/ClaimStep';
import { CreateWorkspaceLayout } from '@/components/create-workspace/CreateWorkspaceLayout';
import { StepHeading } from '@/components/create-workspace/StepHeading';
import { createControlPlane, type ControlPlane } from '@/lib/onboarding/control-plane-client';
import { readControlPlaneBase } from '@/lib/onboarding/control-plane-config';
import { recordIssuedClaim, revealClaimCode } from '@/lib/onboarding/claim-handoff';
import { parseClaimLink, type ClaimLink as Link } from '@/lib/onboarding/claim-link';
import { workspaceHostFor } from '@/lib/onboarding/slug';
import { FORM_STEP_LABELS } from '@/lib/onboarding/create-flow';
import { describeFailure } from '@/lib/failure-message';
import { debugLog } from '@/lib/debug-config';

/** Read the link and take it out of the address bar, once, before anything renders from it. */
function takeLink(): Link | null {
  const parsed: Link | null = parseClaimLink(window.location.hash);
  const link: Link | null = parsed?.kind === 'billing' ? null : parsed;
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  if (link?.kind === 'claim') recordIssuedClaim(workspaceHostFor(link.slug), link.code);
  return link;
}

export function ClaimLinkPage({ api }: { api: ControlPlane }): JSX.Element {
  const navigate: NavigateFunction = useNavigate();
  const [link] = useState<Link | null>(takeLink);
  const [claimCode] = useState<string | undefined>(() => (link?.kind === 'claim' ? revealClaimCode() : undefined));
  const [outcome, setOutcome] = useState<'idle' | 'working' | 'done' | string>('idle');

  if (link === null || link.kind === 'billing') {
    return (
      <CreateWorkspaceLayout stepNumber={undefined} stepLabels={FORM_STEP_LABELS}>
        <StepHeading title="This link cannot be used">
          It is incomplete or has been changed. Open the link from the email again, or ask for a new email.
        </StepHeading>
      </CreateWorkspaceLayout>
    );
  }

  if (link.kind === 'not-me') {
    const forget = async (): Promise<void> => {
      setOutcome('working');
      try { await api.notMe(link.slug, link.token); setOutcome('done'); } catch (e) { setOutcome(describeFailure(e, 'That did not work. Try again.')); }
    };
    return (
      <CreateWorkspaceLayout stepNumber={undefined} stepLabels={FORM_STEP_LABELS}>
        <StepHeading title={outcome === 'done' ? 'Done' : "Didn't create a workspace?"}>
          {outcome === 'done'
            ? 'Your address has been removed, and you will not be emailed about this workspace again.'
            : 'Someone gave your email address while creating a Citadel workspace. Remove it, and it will not be emailed again.'}
        </StepHeading>
        {outcome !== 'done' && (
          <Button onClick={() => { const _: Promise<void> = forget(); }} disabled={outcome === 'working'} data-testid="claim-not-me">
            This wasn't me
          </Button>
        )}
        {outcome !== 'idle' && outcome !== 'working' && outcome !== 'done' && <p role="alert" className="mt-3 text-sm text-destructive-emphasis">{outcome}</p>}
      </CreateWorkspaceLayout>
    );
  }

  // Confirming never stands in the way of claiming: a stale link still opens the workspace.
  const openWorkspace = async (): Promise<void> => {
    try { await api.verifyEmail(link.slug, link.token); } catch (e) { debugLog('ClaimLink', 'The email address was not confirmed; claiming goes on:', e); }
    navigate('/?join=1');
  };
  return (
    <CreateWorkspaceLayout stepNumber={undefined} stepLabels={FORM_STEP_LABELS}>
      <ClaimStep
        workspaceHost={workspaceHostFor(link.slug)}
        claimCode={claimCode}
        emailSent={null}
        onOpenWorkspace={() => { const _: Promise<void> = openWorkspace(); }}
      />
    </CreateWorkspaceLayout>
  );
}

/** The `/claim` route, against the control plane this deployment publishes. */
export default function ClaimLink(): JSX.Element {
  const [api] = useState<ControlPlane | undefined>(() => {
    const base: string | undefined = readControlPlaneBase(document);
    return base === undefined ? undefined : createControlPlane((input: string, init?: RequestInit): Promise<Response> => fetch(input, init), base);
  });
  if (api === undefined) {
    return (
      <CreateWorkspaceLayout stepNumber={undefined} stepLabels={FORM_STEP_LABELS}>
        <StepHeading title="Workspaces are not claimed here">This Citadel site does not host workspaces.</StepHeading>
      </CreateWorkspaceLayout>
    );
  }
  return <ClaimLinkPage api={api} />;
}
