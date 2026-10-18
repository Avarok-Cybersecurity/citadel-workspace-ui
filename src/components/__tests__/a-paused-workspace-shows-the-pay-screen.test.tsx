/**
 * Joining a workspace that is paused for payment: discovery's 403 `payment-required` puts the pay
 * screen where the form's check would be -- since when, what is refused now, the purge date, where
 * the invoice went -- and its owner can open billing (the Plan & billing claim-code flow) from it.
 *
 * Doubled at the I/O seams as in registration-can-ask-for-a-human-check (login-world.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/websocket-service', async (orig: () => Promise<Record<string, unknown>>) => (await import('./login-world')).websocketServiceDouble(orig));
vi.mock('@/lib/connection', () => ({ ConnectionManager: { getInstance: (): { handleAuthSuccess: () => Promise<void> } => ({ handleAuthSuccess: async (): Promise<void> => undefined }) } }));
vi.mock('@/lib/signup-follow-ups', () => ({ startSignupFollowUps: (): void => undefined }));
vi.mock('@/lib/sign-in', async (orig: () => Promise<Record<string, unknown>>) => (await import('./login-world')).signInDouble(orig));
vi.mock('@/lib/admission', async (orig: () => Promise<Record<string, unknown>>) => (await import('./login-world')).admissionDouble(orig));

import { Join } from '../Join';
import { world } from '@/lib/sign-in/__tests__/helpers';
import { formatUtc } from '@/lib/billing/billing-copy';
import { HOUR, T0 } from '@/lib/billing/__tests__/billing-fixtures';
import { loginWorld as h } from './login-world';

const PURGE: number = T0 + 30 * 24 * HOUR;

function renderJoin(): void {
  render(<MemoryRouter><Join onNext={vi.fn()} onBack={vi.fn()} serverAddress="bench.work.avarok.net" serverPassword="" /></MemoryRouter>);
}

beforeEach(() => {
  h.w = world(false);
  document.head.innerHTML = '<meta name="citadel-control-plane" content="/api">';
});
afterEach(() => { h.w.stop(); h.discovered = null; document.head.innerHTML = ''; });

describe('a workspace paused for payment', () => {
  it('shows the pay screen with the dates, what is refused, and the invoice', async () => {
    h.discovered = { kind: 'payment-required', refusal: { detail: undefined, since: T0, purgeAt: PURGE } };
    renderJoin();
    const screenEl: HTMLElement = await screen.findByTestId('payment-required');
    expect(screenEl).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('heading', { name: 'This workspace is paused' })).toBeInTheDocument();
    expect(screen.getByTestId('payment-required-since')).toHaveTextContent(formatUtc(T0));
    expect(screen.getByTestId('payment-required-now')).toHaveTextContent('nothing in the workspace can be read or written, and its relay is off');
    expect(screen.getByTestId('payment-required-purge')).toHaveTextContent(`On ${formatUtc(PURGE)}, the workspace's data is deleted.`);
    expect(screen.getByTestId('payment-required-invoice')).toHaveTextContent('The invoice link was emailed to the billing address.');
  });

  it('lets the owner open billing with the claim code', async () => {
    h.discovered = { kind: 'payment-required', refusal: { detail: undefined, since: T0, purgeAt: PURGE } };
    renderJoin();
    fireEvent.click(await screen.findByTestId('payment-required-open-billing'));
    expect(await screen.findByLabelText('Claim code')).toHaveAttribute('type', 'password');
  });

  it('shows no pay screen for a workspace that is not paused', async () => {
    h.discovered = { required: false, siteKey: '' };
    renderJoin();
    await screen.findByTestId('join-submit');
    await new Promise((r: (v: void) => void): void => { setTimeout(r, 20); });
    expect(screen.queryByTestId('payment-required')).toBeNull();
  });
});
