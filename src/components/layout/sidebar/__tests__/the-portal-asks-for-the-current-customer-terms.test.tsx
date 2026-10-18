/**
 * The portal answers 409 `customer-terms-stale` when the Customer Terms moved on. The person reads
 * and ticks the current ones, and the request is sent again with that version. A version newer than
 * the text this page carries is never offered for acceptance. Harness: billing-dialog-harness.tsx.
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PORTAL_ORIGIN } from '@/lib/onboarding/control-plane-client';
import { SHOWN_CUSTOMER_TERMS_VERSION } from '@/lib/terms/customer-terms';
import { usageBody } from '@/lib/billing/__tests__/billing-fixtures';
import { CODE, renderDialog, submitCode, type RecordedTab } from './billing-dialog-harness';

const PORTAL: string = `${PORTAL_ORIGIN}/p/session/terms_fixture`;
const stale = (current: number): { status: number; body: unknown } =>
  ({ status: 409, body: { error: 'customer-terms-stale', current, document: 'customer-terms' } });

describe('stale Customer Terms at the portal', () => {
  it('asks for acceptance, then resends with the accepted version and opens the portal', async () => {
    const { fake, tabs } = renderDialog({
      usage: { status: 200, body: usageBody() },
      portal: [stale(SHOWN_CUSTOMER_TERMS_VERSION), { status: 200, body: { portal_url: PORTAL } }],
    });
    await submitCode();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage subscription' }));
    await userEvent.click(await screen.findByTestId('customer-terms-read'));
    expect(screen.getByTestId('terms-accept')).toBeDisabled();
    await userEvent.click(screen.getByTestId('terms-agree'));
    await userEvent.click(screen.getByTestId('terms-accept'));
    await screen.findByText(/opened in a new tab/i);
    const portalBodies: unknown[] = fake.requests.filter((r) => r.path === '/api/tenants/acme/portal').map((r) => r.body);
    expect(portalBodies).toEqual([
      { claim_code: CODE },
      { claim_code: CODE, accepted_customer_terms_version: SHOWN_CUSTOMER_TERMS_VERSION },
    ]);
    expect(tabs.map((t: RecordedTab) => [t.sentTo, t.closed])).toEqual([[undefined, true], [PORTAL, false]]);
  });

  it('sends nothing more when the person cancels the terms', async () => {
    const { fake } = renderDialog({ usage: { status: 200, body: usageBody() }, portal: stale(SHOWN_CUSTOMER_TERMS_VERSION) });
    await submitCode();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage subscription' }));
    await userEvent.click(await screen.findByTestId('customer-terms-read'));
    await userEvent.click(screen.getByTestId('terms-cancel'));
    expect(fake.requests.filter((r) => r.path === '/api/tenants/acme/portal')).toHaveLength(1);
  });

  it('never offers a version whose text this page does not carry', async () => {
    renderDialog({ usage: { status: 200, body: usageBody() }, portal: stale(SHOWN_CUSTOMER_TERMS_VERSION + 1) });
    await submitCode();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage subscription' }));
    expect(await screen.findByTestId('customer-terms-reload')).toHaveTextContent(`version ${SHOWN_CUSTOMER_TERMS_VERSION + 1}`);
    expect(screen.queryByTestId('customer-terms-read')).toBeNull();
  });
});
