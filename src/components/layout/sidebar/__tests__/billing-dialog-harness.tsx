/**
 * The Plan & billing dialog's harness: the real dialog and control-plane client, answered at the
 * fetch boundary by contract-fake.ts, with a recorder for the one thing jsdom cannot do -- open a tab.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createControlPlane } from '@/lib/onboarding/control-plane-client';
import type { PortalTab } from '@/lib/onboarding/billing-portal';
import { contractFake, type ContractFake, type Scripted } from '@/lib/onboarding/__tests__/contract-fake';
import { POLICY_BODY } from '@/lib/billing/__tests__/billing-fixtures';
import { ManageSubscriptionDialog } from '../ManageSubscriptionDialog';

// A well-formed claim code (64 hex): a fixture, never a real one.
export const CODE: string = 'cd'.repeat(32);

export interface RecordedTab extends PortalTab {
  sentTo: string | undefined;
  closed: boolean;
}

export interface DialogScript {
  readonly usage: Scripted;
  /** Replies in order; undefined when the test never reaches the portal. */
  readonly portal: Scripted | readonly Scripted[] | undefined;
  readonly overage?: Scripted;
  readonly policy?: Scripted;
  readonly blocked?: boolean;
}

export function renderDialog(script: DialogScript): { fake: ContractFake; tabs: RecordedTab[] } {
  const fake: ContractFake = contractFake();
  fake.usageReplies.push(script.usage);
  if (script.portal !== undefined) fake.portalReplies.push(...(Array.isArray(script.portal) ? script.portal : [script.portal as Scripted]));
  fake.policyReplies.push(script.policy ?? { status: 200, body: POLICY_BODY });
  if (script.overage) fake.overageReplies.push(script.overage);
  const tabs: RecordedTab[] = [];
  const openTab = (): PortalTab | null => {
    if (script.blocked === true) return null;
    const tab: RecordedTab = {
      sentTo: undefined,
      closed: false,
      navigate(url: string): void { tab.sentTo = url; },
      close(): void { tab.closed = true; },
    };
    tabs.push(tab);
    return tab;
  };
  render(
    <ManageSubscriptionDialog
      open={true} onOpenChange={(): void => undefined}
      slug="acme" api={createControlPlane(fake.fetch, '/api')} openTab={openTab}
    />,
  );
  return { fake, tabs };
}

export async function submitCode(): Promise<HTMLInputElement> {
  const field: HTMLInputElement = screen.getByLabelText('Claim code') as HTMLInputElement;
  await userEvent.type(field, CODE);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  return field;
}
