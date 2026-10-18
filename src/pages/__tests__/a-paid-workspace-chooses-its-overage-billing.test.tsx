/**
 * A paid workspace is created only with its owner's own overage-billing choice: offered with
 * nothing pre-selected, rendered from the control plane's policy, disabled while that is on its
 * way, and replaced by the client's sentence when it fails. Free never sees it or sends it.
 * Doubles as in the flow's own spec: the fetch boundary (contract-fake.ts) and Turnstile.
 */
import { describe, it, expect } from 'vitest';
import { cleanup, screen, waitFor, fireEvent } from '@testing-library/react';
import { contractFake, type ContractFake } from '@/lib/onboarding/__tests__/contract-fake';
import { CHANGE_NOTICE, POLICY_BODY } from '@/lib/billing/__tests__/billing-fixtures';
import { chooseOverage, nameIt, renderFlow, submitWithTerms, throughToReview, installFlowHooks } from './create-flow-harness';

installFlowHooks();

const CHECKOUT: { status: number; body: unknown } = { status: 200, body: { checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_o' } };
const posted = (fake: ContractFake): unknown => fake.requests.filter((r) => r.method === 'POST').at(-1)?.body;

async function toPaidReview(fake: ContractFake): Promise<void> {
  renderFlow(fake);
  await nameIt('Acme');
  await waitFor(() => expect(screen.getByTestId('create-name-continue')).toBeEnabled());
  fireEvent.click(screen.getByTestId('create-name-continue'));
  fireEvent.click(screen.getByTestId('plan-team'));
  fireEvent.click(screen.getByTestId('create-plan-continue'));
}

describe('the overage-billing choice', () => {
  it('pre-selects nothing, and Create waits for a pick', async () => {
    const fake: ContractFake = contractFake();
    fake.policyReplies.push({ status: 200, body: POLICY_BODY });
    await toPaidReview(fake);
    await waitFor(() => expect(screen.getByTestId('overage-on')).toBeEnabled());
    expect(screen.getByTestId('overage-on')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('overage-off')).toHaveAttribute('aria-checked', 'false');
    // The token arrives; Create stays disabled: the missing choice is all that holds it.
    await new Promise((r: (v: void) => void): void => { setTimeout(r, 20); });
    expect(screen.getByTestId('create-submit')).toBeDisabled();
    await chooseOverage(false);
    await waitFor(() => expect(screen.getByTestId('create-submit')).toBeEnabled());
  });

  it('renders both options from the policy, with its change notice', async () => {
    const fake: ContractFake = contractFake();
    fake.policyReplies.push({ status: 200, body: POLICY_BODY });
    await toPaidReview(fake);
    const choice: HTMLElement = await screen.findByTestId('overage-change-notice');
    expect(choice).toHaveTextContent(CHANGE_NOTICE);
    const text: string = screen.getByTestId('overage-choice').textContent ?? '';
    expect(text).toContain('after 23 days, deleted');
    expect(text).toContain('terminated after 37 hours');
    expect(text).toContain('Fixture: documents become read-only.');
    expect(text).toContain('No data is deleted.');
  });

  it('sends the pick: off is false, on is true', async () => {
    for (const enabled of [false, true]) {
      const fake: ContractFake = contractFake();
      fake.policyReplies.push({ status: 200, body: POLICY_BODY });
      fake.createReplies.push(CHECKOUT);
      renderFlow(fake);
      await throughToReview(() => fireEvent.click(screen.getByTestId('plan-team')), enabled);
      await submitWithTerms();
      await waitFor(() => expect(posted(fake)).toMatchObject({ tier: 'team', overage_billing: enabled }));
      cleanup();
    }
  });

  it('keeps the options disabled while the policy loads', async () => {
    const fake: ContractFake = contractFake();
    let release: (() => void) | undefined;
    const slow: ContractFake['fetch'] = async (input: string, init?: RequestInit): Promise<Response> => {
      if (input.endsWith('/billing/policy')) await new Promise<void>((r: () => void): void => { release = r; });
      return fake.fetch(input, init);
    };
    fake.policyReplies.push({ status: 200, body: POLICY_BODY });
    await toPaidReview({ ...fake, fetch: slow });
    expect(await screen.findByText(/Loading the billing terms/)).toBeInTheDocument();
    expect(screen.getByTestId('overage-on')).toBeDisabled();
    expect(screen.getByTestId('overage-off')).toBeDisabled();
    release?.();
    await waitFor(() => expect(screen.getByTestId('overage-on')).toBeEnabled());
  });

  it('shows the client\'s sentence when the policy cannot be had, and no numbers', async () => {
    const fake: ContractFake = contractFake();
    fake.policyReplies.push({ status: 200, body: { ...POLICY_BODY, dunning: {} } });
    fake.policyReplies.push({ status: 200, body: POLICY_BODY });
    await toPaidReview(fake);
    expect(await screen.findByTestId('overage-policy-error')).toHaveTextContent(/unexpected reply \(billing policy\)/);
    expect(screen.getByTestId('overage-on')).toBeDisabled();
    expect(screen.getByTestId('overage-choice')).not.toHaveTextContent(/days|hours/);
    fireEvent.click(screen.getByTestId('overage-policy-retry'));
    await waitFor(() => expect(screen.getByTestId('overage-on')).toBeEnabled());
  });

  it('is not offered to a Free workspace, which sends no choice and asks no policy', async () => {
    const fake: ContractFake = contractFake();
    fake.createReplies.push({ status: 200, body: { claim_code: 'C', workspace_host: 'acme.work.avarok.net' } });
    renderFlow(fake);
    await throughToReview(() => {});
    expect(screen.queryByTestId('overage-choice')).toBeNull();
    await submitWithTerms();
    await waitFor(() => expect(screen.getByTestId('claim-step')).toBeInTheDocument());
    expect(posted(fake)).not.toHaveProperty('overage_billing');
    expect(fake.requests.some((r) => r.path === '/api/billing/policy')).toBe(false);
  });

  it('asks again after a trip back to the plan', async () => {
    const fake: ContractFake = contractFake();
    fake.policyReplies.push({ status: 200, body: POLICY_BODY });
    await toPaidReview(fake);
    await chooseOverage(true);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByTestId('create-plan-continue'));
    await waitFor(() => expect(screen.getByTestId('overage-on')).toBeEnabled());
    expect(screen.getByTestId('overage-on')).toHaveAttribute('aria-checked', 'false');
    expect(fake.requests.filter((r) => r.path === '/api/billing/policy')).toHaveLength(1);
  });
});
