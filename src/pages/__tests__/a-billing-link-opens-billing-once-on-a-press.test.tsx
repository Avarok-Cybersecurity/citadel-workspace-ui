/**
 * `/billing`: a mailed billing link opens the portal on a press, never on load, and its token is
 * gone from the address bar at once.
 *
 * Runs the real page and control-plane client, answered at the fetch boundary by contract-fake;
 * `go` stands in for leaving the page, which jsdom cannot do.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { createControlPlane, PORTAL_ORIGIN } from '@/lib/onboarding/control-plane-client';
import { contractFake, type ContractFake } from '@/lib/onboarding/__tests__/contract-fake';
import { BillingLinkPage } from '../BillingLink';

// Fixtures of the right shape; never real tokens.
const TOKEN: string = 'ab'.repeat(32);
const PORTAL: string = `${PORTAL_ORIGIN}/p/session/test_fixture`;

let fake: ContractFake;
let go: Mock<(url: string) => void>;
function open(hash: string): void {
  window.history.replaceState(null, '', `/billing${hash}`);
  render(<MemoryRouter><BillingLinkPage api={createControlPlane(fake.fetch, '/api')} go={go} /></MemoryRouter>);
}
beforeEach(() => { fake = contractFake(); go = vi.fn(); });

describe('a billing link', () => {
  it('asks nothing of the server until pressed, and strips its token at once', () => {
    fake.portalLinkReplies.push({ status: 200, body: { portal_url: PORTAL } });
    open(`#slug=acme&t=${TOKEN}`);
    expect(window.location.hash).toBe('');
    expect(fake.requests).toHaveLength(0);
  });

  it('opens the portal on the press', async () => {
    fake.portalLinkReplies.push({ status: 200, body: { portal_url: PORTAL } });
    open(`#slug=acme&t=${TOKEN}`);
    await userEvent.click(screen.getByTestId('billing-link-open'));
    expect(fake.requests[0]).toEqual({ method: 'POST', path: '/api/tenants/acme/portal-link', body: { token: TOKEN } });
    expect(go).toHaveBeenCalledWith(PORTAL);
  });

  it('says a spent or expired link cannot be used again', async () => {
    fake.portalLinkReplies.push({ status: 400, body: { error: 'link-invalid', detail: 'x' } });
    open(`#slug=acme&t=${TOKEN}`);
    await userEvent.click(screen.getByTestId('billing-link-open'));
    expect((await screen.findByTestId('billing-link-refused')).textContent).toMatch(/expired or has already been used/);
    expect(go).not.toHaveBeenCalled();
  });

  it('refuses a link that is not exactly a billing link', () => {
    open(`#slug=acme&t=${TOKEN}&extra=1`);
    expect(screen.getByText('This link cannot be used')).toBeTruthy();
    expect(screen.queryByTestId('billing-link-open')).toBeNull();
  });
});
