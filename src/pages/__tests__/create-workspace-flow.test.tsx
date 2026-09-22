/**
 * The create-workspace flow, rendered for real and driven the way a visitor
 * drives it.
 *
 * Two doubles, both at a boundary this repository does not own:
 *   - the control plane, via contract-fake.ts at the fetch boundary (it is being
 *     built concurrently and cannot be called), so the real client runs;
 *   - Cloudflare's Turnstile widget, as `window.turnstile` (the real one needs
 *     the network and a person). The page's own loader and widget component run.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CreateWorkspaceFlow } from '../CreateWorkspace';
import { createControlPlane, type ControlPlane } from '@/lib/onboarding/control-plane-client';
import { forgetIssuedClaim, recordIssuedClaim, revealClaimCode } from '@/lib/onboarding/claim-handoff';
import { clearDraft, loadDraft, saveDraft } from '@/lib/onboarding/create-flow';
import { ClaimStep } from '@/components/create-workspace/ClaimStep';
import { contractFake, type ContractFake } from '@/lib/onboarding/__tests__/contract-fake';

let tokens: number = 0;
const resets: string[] = [];

function installTurnstile(): void {
  window.turnstile = {
    render: (_el: HTMLElement, options: { callback: (token: string) => void }): string => {
      setTimeout(() => options.callback(`token-${++tokens}`), 0);
      window.turnstileCallback = options.callback;
      return 'widget-1';
    },
    reset: (id: string): void => {
      resets.push(id);
      setTimeout(() => window.turnstileCallback?.(`token-${++tokens}`), 0);
    },
    remove: (): void => {},
  };
}

declare global {
  interface Window {
    turnstileCallback?: (token: string) => void;
  }
}

function renderFlow(fake: ContractFake, at: string = '/create', redirect: (url: string) => void = vi.fn()): RenderResult {
  const api: ControlPlane = createControlPlane(fake.fetch, '/api');
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/create" element={<CreateWorkspaceFlow api={api} redirect={redirect} />} />
        <Route path="/" element={<p>landing</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function nameIt(name: string): Promise<void> {
  fireEvent.change(screen.getByTestId('create-display-name'), { target: { value: name } });
}

beforeEach(() => {
  installTurnstile();
  forgetIssuedClaim();
  clearDraft();
  tokens = 0;
  resets.length = 0;
});
afterEach(() => {
  delete window.turnstile;
});

describe('naming the workspace', () => {
  it('derives the address from the name and says it is available', async () => {
    renderFlow(contractFake());
    await nameIt('Acme Robotics');
    expect(screen.getByTestId('create-slug')).toHaveValue('acme-robotics');
    expect(screen.getByTestId('create-host-preview')).toHaveTextContent('https://acme-robotics.work.avarok.net');
    await waitFor(() => expect(screen.getByTestId('create-slug-status')).toHaveTextContent('Available'));
    expect(screen.getByTestId('create-name-continue')).toBeEnabled();
  });

  it('will not continue with a taken address', async () => {
    const fake: ContractFake = contractFake();
    fake.unavailable.set('acme', 'taken');
    renderFlow(fake);
    await nameIt('Acme');
    await waitFor(() => expect(screen.getByTestId('create-slug-status')).toHaveTextContent('already taken'));
    expect(screen.getByTestId('create-name-continue')).toBeDisabled();
  });

  it('stops following the name once the address is edited, and checks shape before asking', async () => {
    const fake: ContractFake = contractFake();
    renderFlow(fake);
    fireEvent.change(screen.getByTestId('create-slug'), { target: { value: 'ab' } });
    expect(screen.getByTestId('create-slug-status')).toHaveTextContent('At least 3 characters');
    await nameIt('Something Else');
    expect(screen.getByTestId('create-slug')).toHaveValue('ab');
    expect(fake.requests).toHaveLength(0);
  });
});

async function throughToReview(choosePlan: () => void): Promise<void> {
  await nameIt('Acme');
  await waitFor(() => expect(screen.getByTestId('create-name-continue')).toBeEnabled());
  fireEvent.click(screen.getByTestId('create-name-continue'));
  choosePlan();
  fireEvent.click(screen.getByTestId('create-plan-continue'));
  await waitFor(() => expect(screen.getByTestId('create-submit')).toBeEnabled());
}

describe('a free workspace', () => {
  it('is created, shows its claim code once, and hands over to the join wizard', async () => {
    const fake: ContractFake = contractFake();
    fake.createReplies.push({ status: 200, body: { claim_code: 'CLAIM-7Q2', workspace_host: 'acme.work.avarok.net' } });
    renderFlow(fake);
    await throughToReview(() => {});
    expect(screen.getByTestId('review-total')).toHaveTextContent('Free');
    fireEvent.click(screen.getByTestId('create-submit'));

    await waitFor(() => expect(screen.getByTestId('claim-code')).toHaveTextContent('CLAIM-7Q2'));
    expect(fake.requests.at(-1)?.body).toEqual({ slug: 'acme', display_name: 'Acme', tier: 'free', turnstile_token: 'token-1' });
    expect(screen.getByText(/becomes the owner/)).toBeInTheDocument();

    expect(screen.getByTestId('claim-continue')).toBeDisabled();
    fireEvent.click(screen.getByTestId('claim-stored'));
    fireEvent.click(screen.getByTestId('claim-continue'));
    expect(screen.queryByTestId('claim-code')).toBeNull();
    expect(document.body.textContent).not.toContain('CLAIM-7Q2');

    fireEvent.click(screen.getByTestId('claim-open-workspace'));
    await waitFor(() => expect(screen.getByText('landing')).toBeInTheDocument());
  });

  it('asks for a new token after a refusal, and does not resend the spent one', async () => {
    const fake: ContractFake = contractFake();
    fake.createReplies.push({ status: 403, body: { error: 'Human verification failed.' } });
    fake.createReplies.push({ status: 200, body: { claim_code: 'C', workspace_host: 'acme.work.avarok.net' } });
    renderFlow(fake);
    await throughToReview(() => {});
    fireEvent.click(screen.getByTestId('create-submit'));
    await waitFor(() => expect(screen.getByTestId('create-error')).toHaveTextContent('Human verification failed.'));
    expect(resets).toEqual(['widget-1']);
    await waitFor(() => expect(screen.getByTestId('create-submit')).toBeEnabled());
    fireEvent.click(screen.getByTestId('create-submit'));
    await waitFor(() => expect(screen.getByTestId('claim-step')).toBeInTheDocument());
    const sent: unknown[] = fake.requests.filter((r) => r.method === 'POST').map((r) => (r.body as { turnstile_token: string }).turnstile_token);
    expect(sent).toEqual(['token-1', 'token-2']);
  });
});

describe('a paid workspace', () => {
  it('prices seats and storage, then leaves for Checkout with the draft kept', async () => {
    const fake: ContractFake = contractFake();
    fake.createReplies.push({ status: 200, body: { checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_9' } });
    const redirect: ReturnType<typeof vi.fn> = vi.fn();
    renderFlow(fake, '/create', redirect);
    await throughToReview(() => {
      fireEvent.click(screen.getByTestId('plan-team'));
      fireEvent.click(screen.getByTestId('interval-year'));
      fireEvent.click(screen.getByTestId('plan-seats-increase'));
      fireEvent.click(screen.getByTestId('plan-storage-increase'));
      expect(screen.getByTestId('plan-total-amount')).toHaveTextContent('$260 / year');
    });
    expect(screen.getByTestId('review-total')).toHaveTextContent('$260 / year');
    fireEvent.click(screen.getByTestId('create-submit'));

    await waitFor(() => expect(redirect).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_9'));
    expect(fake.requests.at(-1)?.body).toEqual({
      slug: 'acme', display_name: 'Acme', tier: 'team', interval: 'year', seats: 4, storage_blocks: 1, turnstile_token: 'token-1',
    });
    expect(loadDraft('acme')?.plan.seats).toBe(4);
  });

  it('on return, waits for the workspace and then shows its code', async () => {
    const fake: ContractFake = contractFake();
    fake.statusReplies.push({ status: 200, body: { status: 'pending' } });
    fake.statusReplies.push({ status: 200, body: { status: 'active', claim_code: 'PAID-CODE', workspace_host: 'acme.work.avarok.net' } });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderFlow(fake, '/create?slug=acme&session_id=cs_test_9');
      expect(screen.getByTestId('provisioning')).toHaveTextContent('acme.work.avarok.net');
      await vi.advanceTimersByTimeAsync(2500);
      await waitFor(() => expect(screen.getByTestId('claim-code')).toHaveTextContent('PAID-CODE'));
    } finally {
      vi.useRealTimers();
    }
    expect(fake.requests.map((r) => r.path)).toEqual([
      '/api/tenants/acme/status?session_id=cs_test_9',
      '/api/tenants/acme/status?session_id=cs_test_9',
    ]);
  });

  it('says so, and offers the plan back, when Checkout was cancelled', async () => {
    saveDraft({ displayName: 'Acme', slug: 'acme', plan: { tier: 'business', interval: 'month', seats: 5, storageBlocks: 0 } });
    renderFlow(contractFake(), '/create?slug=acme&cancelled=1');
    expect(screen.getByTestId('checkout-cancelled')).toHaveTextContent('Nothing was charged');
    fireEvent.click(screen.getByTestId('cancelled-back-to-plans'));
    expect(screen.getByTestId('plan-seats')).toHaveValue('5');
    expect(screen.getByTestId('plan-total-amount')).toHaveTextContent('$60 / month');
  });
});

describe('the claim screen', () => {
  it('does not show the code a second time when it is opened again', () => {
    recordIssuedClaim('acme.work.avarok.net', 'ONCE-ONLY');
    const first: RenderResult = render(
      <MemoryRouter><ClaimStep workspaceHost="acme.work.avarok.net" claimCode={revealClaimCode()} onOpenWorkspace={() => {}} /></MemoryRouter>,
    );
    expect(first.getByTestId('claim-code')).toHaveTextContent('ONCE-ONLY');
    first.unmount();

    render(
      <MemoryRouter><ClaimStep workspaceHost="acme.work.avarok.net" claimCode={revealClaimCode()} onOpenWorkspace={() => {}} /></MemoryRouter>,
    );
    expect(screen.queryByTestId('claim-code')).toBeNull();
    expect(screen.getByTestId('claim-already-shown')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('ONCE-ONLY');
  });
});
