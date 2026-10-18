/**
 * "Plan & billing": the owner proves ownership with the claim code, sees the panel, and the
 * Stripe billing portal opens in a new tab from it -- or they are told, in plain words, why not.
 *
 * The dialog runs against the real control-plane client, answered at the fetch boundary by
 * contract-fake.ts. The one stand-in is the new tab (`openTab`): jsdom cannot open or navigate a
 * browser tab, so a recorder takes its place and reports where it was sent and whether it closed.
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PORTAL_ORIGIN } from '@/lib/onboarding/control-plane-client';
import { usageBody } from '@/lib/billing/__tests__/billing-fixtures';
import { CODE, renderDialog, submitCode, type RecordedTab } from './billing-dialog-harness';

const PORTAL: string = `${PORTAL_ORIGIN}/p/session/test_fixture`;
const OK_USAGE: { status: number; body: unknown } = { status: 200, body: usageBody() };

async function openPortal(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Manage subscription' }));
}

describe('manage subscription', () => {
  it('asks for the claim code in a password field', () => {
    renderDialog({ usage: OK_USAGE, portal: { status: 200, body: { portal_url: PORTAL } } });
    expect((screen.getByLabelText('Claim code') as HTMLInputElement).type).toBe('password');
  });

  it('reads the meters with the code, then opens the portal in a new tab; no field keeps the code', async () => {
    const { fake, tabs } = renderDialog({ usage: OK_USAGE, portal: { status: 200, body: { portal_url: PORTAL } } });
    await submitCode();
    await openPortal();
    await screen.findByText(/opened in a new tab/i);
    expect(tabs.map((t: RecordedTab) => [t.sentTo, t.closed])).toEqual([[PORTAL, false]]);
    expect(fake.requests.filter((r) => r.method === 'POST')).toEqual([
      { method: 'POST', path: '/api/tenants/acme/usage', body: { claim_code: CODE } },
      { method: 'POST', path: '/api/tenants/acme/portal', body: { claim_code: CODE } },
    ]);
    const held: string[] = Array.from(document.querySelectorAll('input')).map((i: HTMLInputElement) => i.value);
    expect(held.includes(CODE)).toBe(false);
  });

  it('offers a link when the browser blocked the new tab', async () => {
    renderDialog({ usage: OK_USAGE, portal: { status: 200, body: { portal_url: PORTAL } }, blocked: true });
    await submitCode();
    await openPortal();
    const link: HTMLAnchorElement = await screen.findByRole('link', { name: /open billing portal/i });
    expect([link.href, link.target, link.rel]).toEqual([PORTAL, '_blank', 'noopener noreferrer']);
  });

  it('says a wrong code does not own the workspace, opens no tab, clears the code', async () => {
    const { tabs } = renderDialog({ usage: { status: 403, body: { error: 'not-owner', detail: 'x' } }, portal: undefined });
    const field: HTMLInputElement = await submitCode();
    await screen.findByText("That claim code doesn't own this workspace");
    expect(tabs).toEqual([]);
    expect(field.value).toBe('');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByTestId('billing-panel')).toBeNull();
  });

  it('says the Free plan has nothing to manage, and leaves nothing to press', async () => {
    renderDialog({ usage: { status: 404, body: { error: 'no-subscription', detail: 'x' } }, portal: undefined });
    await submitCode();
    await screen.findByText("This workspace is on the Free plan — there's no subscription to manage");
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByLabelText('Claim code')).toBeNull();
  });

  it('says billing management is not available yet', async () => {
    renderDialog({ usage: { status: 503, body: { error: 'billing-not-configured', detail: 'x' } }, portal: undefined });
    await submitCode();
    await screen.findByText("Billing management isn't available yet");
    expect(screen.queryByRole('button', { name: 'Manage subscription' })).toBeNull();
  });

  it('still offers the portal when only the meters failed', async () => {
    const { tabs } = renderDialog({ usage: { status: 500, body: {} }, portal: { status: 200, body: { portal_url: PORTAL } } });
    await submitCode();
    expect(await screen.findByTestId('usage-error')).toHaveTextContent(/try again/i);
    await openPortal();
    await screen.findByText(/opened in a new tab/i);
    expect(tabs[0].sentTo).toBe(PORTAL);
  });

  it('closes the tab and says why when the portal refuses', async () => {
    const { tabs } = renderDialog({ usage: OK_USAGE, portal: { status: 404, body: { error: 'no-subscription' } } });
    await submitCode();
    await openPortal();
    await screen.findByText("This workspace is on the Free plan — there's no subscription to manage");
    expect(tabs.map((t: RecordedTab) => [t.sentTo, t.closed])).toEqual([[undefined, true]]);
    expect(screen.queryByRole('button', { name: 'Manage subscription' })).toBeNull();
  });
});
