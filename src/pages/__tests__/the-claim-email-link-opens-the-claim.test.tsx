/**
 * The claim email's link opens the claim with the code filled in, confirms the address only when
 * pressed, and takes itself out of the address bar.
 *
 * Stubbed: the control plane, a network service (its routes are covered by the worker's
 * owner-email.test.mjs). The page, the parser and the claim handoff are production code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ControlPlane } from '@/lib/onboarding/control-plane-client';
import { claimCodeFor, forgetIssuedClaim } from '@/lib/onboarding/claim-handoff';
import { ClaimLinkPage } from '../ClaimLink';

const CODE: string = 'c'.repeat(64);
const TOKEN: string = 'd'.repeat(64);

type FakeApi = ControlPlane & { verifyEmail: ReturnType<typeof vi.fn>; notMe: ReturnType<typeof vi.fn> };

function fakeApi(): FakeApi {
  return {
    checkSlug: vi.fn(), createTenant: vi.fn(), tenantStatus: vi.fn(), openPortal: vi.fn(),
    verifyEmail: vi.fn(async (): Promise<void> => {}),
    notMe: vi.fn(async (): Promise<void> => {}),
  } as unknown as FakeApi;
}

function open(fragment: string, api: ControlPlane): void {
  window.history.replaceState(null, '', `/claim${fragment}`);
  render(<MemoryRouter><ClaimLinkPage api={api} /></MemoryRouter>);
}

beforeEach(() => { forgetIssuedClaim(); });

describe('the claim link', () => {
  it('fills in the claim, and strips the secrets from the address bar', () => {
    const api: FakeApi = fakeApi();
    open(`#slug=acme&code=${CODE}&v=${TOKEN}`, api);
    expect(window.location.hash).toBe('');
    expect(screen.getByTestId('claim-host').textContent).toBe('acme.work.avarok.net');
    expect(claimCodeFor('acme.work.avarok.net')).toBe(CODE);
  });

  it('confirms the address on the press, not on opening', async () => {
    const api: FakeApi = fakeApi();
    open(`#slug=acme&code=${CODE}&v=${TOKEN}`, api);
    expect(api.verifyEmail).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('claim-stored'));
    fireEvent.click(screen.getByTestId('claim-continue'));
    fireEvent.click(await screen.findByTestId('claim-open-workspace'));
    await waitFor(() => expect(api.verifyEmail).toHaveBeenCalledWith('acme', TOKEN));
  });

  it('forgets the address when its owner says it was not them', async () => {
    const api: FakeApi = fakeApi();
    open(`#slug=acme&not-me=${TOKEN}`, api);
    expect(api.notMe).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('claim-not-me'));
    await waitFor(() => expect(api.notMe).toHaveBeenCalledWith('acme', TOKEN));
    expect(await screen.findByText(/will not be emailed/)).toBeTruthy();
  });

  it('refuses a doctored link', () => {
    open(`#slug=acme&code=${CODE}&v=${TOKEN}&server=evil.example`, fakeApi());
    expect(screen.getByText('This link cannot be used')).toBeTruthy();
    expect(claimCodeFor('acme.work.avarok.net')).toBeUndefined();
  });
});
