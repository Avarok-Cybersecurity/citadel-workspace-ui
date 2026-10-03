/**
 * Registration on a workspace that asks for a human check: the check is shown,
 * its token rides in Register as `admission_token`, and a refusal is answered
 * on the check rather than as a generic "registration failed" toast.
 *
 * Doubled at the I/O seams (login-world.ts), plus ConnectionManager's session
 * store (IndexedDB) and the post-signup profile writes (workspace requests).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const toasts: { titles: string[] } = vi.hoisted(() => ({ titles: [] }));
vi.mock('@/lib/websocket-service', async () => (await import('./login-world')).websocketServiceDouble());
vi.mock('@/lib/connection', () => ({ ConnectionManager: { getInstance: (): { handleAuthSuccess: () => Promise<void> } => ({ handleAuthSuccess: async (): Promise<void> => undefined }) } }));
vi.mock('@/lib/signup-profile-io', () => ({ startSignupProfile: (): void => undefined }));
vi.mock('@/lib/sign-in', async (orig: () => Promise<Record<string, unknown>>) => (await import('./login-world')).signInDouble(orig));
vi.mock('@/lib/admission', async (orig: () => Promise<Record<string, unknown>>) => (await import('./login-world')).admissionDouble(orig));
vi.mock('@/hooks/use-toast', () => ({ useToast: (): { toast: (t: { title: string }) => void } => ({ toast: (t: { title: string }): void => { toasts.titles.push(t.title); } }) }));

import { Join } from '../Join';
import { world } from '@/lib/sign-in/__tests__/helpers';
import { ADMISSION_COPY } from '@/lib/admission/copy';
import { ALWAYS_PASS, installFakeTurnstile, type FakeTurnstile } from '../admission/__tests__/fake-turnstile';
import { loginWorld as h } from './login-world';

let turnstile: FakeTurnstile;
const type = (id: string, value: string): void => { fireEvent.change(document.getElementById(id) as HTMLElement, { target: { value, name: id } }); };
function register(): void {
  type('fullName', 'Alice Example'); type('username', 'alice'); type('password', 'Horse-battery-9'); type('confirmPassword', 'Horse-battery-9');
  fireEvent.click(screen.getByTestId('join-submit'));
}
const registers = (): Record<string, unknown>[] => h.w.agent.sent.filter(([v]) => v === 'Register').map(([, b]) => b);

function renderJoin(): void {
  render(<MemoryRouter><Join onNext={vi.fn()} onBack={vi.fn()} serverAddress="bench.work.avarok.net" serverPassword="" /></MemoryRouter>);
}

beforeEach(() => {
  h.w = world(false);
  h.w.agent.admission.required = true;
  turnstile = installFakeTurnstile();
  toasts.titles = [];
});
afterEach(() => { h.w.stop(); delete window.turnstile; h.discovered = null; });

describe('registering where a human check is required', () => {
  it('shows the check from discovery and sends its token in Register', async () => {
    h.discovered = { required: true, siteKey: ALWAYS_PASS };
    renderJoin();
    await waitFor(() => expect(turnstile.issued).toHaveLength(1));
    expect(turnstile.rendered[0]).toMatchObject({ sitekey: ALWAYS_PASS, action: 'register' });
    register();
    await waitFor(() => expect(h.w.agent.accounts.map((a) => a.username)).toContain('alice'));
    expect(registers()[0]).toMatchObject({ admission_token: turnstile.issued[0] });
  });

  it('answers a refusal on the check, not with a failure toast, when discovery could not say', async () => {
    renderJoin();
    register();
    h.discovered = { required: true, siteKey: ALWAYS_PASS };
    expect(await screen.findByTestId('admission-message')).toHaveTextContent(ADMISSION_COPY.required);
    expect(toasts.titles).toEqual([]);
    expect(registers()[0]).toMatchObject({ admission_token: null });
    await waitFor(() => expect(turnstile.issued).toHaveLength(1));
    register();
    await waitFor(() => expect(h.w.agent.accounts.map((a) => a.username)).toContain('alice'));
    expect(registers()[1]).toMatchObject({ admission_token: turnstile.issued[0] });
  });
});
