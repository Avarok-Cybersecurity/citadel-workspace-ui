/**
 * Once the claim code is presented, Plan & billing shows each meter (percent, state, countdown,
 * what terminates under the policy) and the overage switch, whose confirmation renders the policy's
 * consequences and sends nothing until confirmed. Harness: billing-dialog-harness.tsx.
 */
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CHANGE_NOTICE, usageBody } from '@/lib/billing/__tests__/billing-fixtures';
import { CODE, renderDialog, submitCode } from './billing-dialog-harness';

const posts = (fake: ReturnType<typeof renderDialog>['fake'], path: string): unknown[] =>
  fake.requests.filter((r) => r.method === 'POST' && r.path === path).map((r) => r.body);

describe('the meters', () => {
  it('shows each dimension with its percent, state and amount', async () => {
    renderDialog({ usage: { status: 200, body: usageBody() }, portal: undefined });
    await submitCode();
    await screen.findByTestId('usage-meters');
    const bars: HTMLElement[] = screen.getAllByRole('progressbar');
    expect(bars.map((b: HTMLElement) => b.getAttribute('aria-valuenow'))).toEqual(['100', '40', '90']);
    expect(screen.getByTestId('usage-relay-overage-state')).toHaveTextContent('Terminating');
    expect(screen.getByTestId('usage-storage-state')).toHaveTextContent('Nearing limit');
    expect(screen.getByTestId('usage-relay-overage-amount')).toHaveTextContent('12 of 10 GB (120%)');
  });

  it('counts down to a termination and says what terminates, from the policy', async () => {
    renderDialog({ usage: { status: 200, body: usageBody() }, portal: undefined });
    await submitCode();
    expect(await screen.findByTestId('usage-relay-overage-countdown')).toHaveTextContent(/^Terminates in 5 hours, on /);
    expect(screen.getByTestId('usage-relay-overage-terminates')).toHaveTextContent('At the limit: Fixture: relay is refused.');
    expect(screen.queryByTestId('usage-document-appends-countdown')).toBeNull();
  });

  it('with overage billing on, says what terminates only where it is happening', async () => {
    renderDialog({ usage: { status: 200, body: usageBody({ overage_billing: true }) }, portal: undefined });
    await submitCode();
    await screen.findByTestId('usage-meters');
    expect(screen.getByTestId('usage-relay-overage-terminates')).toBeInTheDocument();
    expect(screen.queryByTestId('usage-storage-terminates')).toBeNull();
  });
});

describe('the overage switch', () => {
  it('confirms with the consequences before sending, and shows what the control plane holds', async () => {
    const { fake } = renderDialog({
      usage: { status: 200, body: usageBody() }, portal: undefined, overage: { status: 200, body: { overage_billing: true } },
    });
    await submitCode();
    const toggle: HTMLElement = await screen.findByTestId('overage-switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    const confirm: HTMLElement = screen.getByTestId('overage-confirm');
    expect(confirm).toHaveTextContent('after 23 days, deleted');
    expect(confirm).toHaveTextContent(CHANGE_NOTICE);
    expect(posts(fake, '/api/tenants/acme/overage')).toEqual([]);
    await userEvent.click(screen.getByTestId('overage-confirm-button'));
    await waitFor(() => expect(screen.queryByTestId('overage-confirm')).toBeNull());
    expect(posts(fake, '/api/tenants/acme/overage')).toEqual([{ claim_code: CODE, enabled: true }]);
    expect(screen.getByTestId('overage-switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('turning it off renders the termination terms, and Cancel sends nothing', async () => {
    const { fake } = renderDialog({ usage: { status: 200, body: usageBody({ overage_billing: true }) }, portal: undefined });
    await submitCode();
    await userEvent.click(await screen.findByTestId('overage-switch'));
    expect(screen.getByTestId('overage-confirm')).toHaveTextContent('terminated after 37 hours');
    expect(screen.getByTestId('overage-confirm')).toHaveTextContent('No data is deleted.');
    await userEvent.click(screen.getByTestId('overage-cancel'));
    expect(screen.getByTestId('overage-switch')).toHaveAttribute('aria-checked', 'true');
    expect(posts(fake, '/api/tenants/acme/overage')).toEqual([]);
  });

  it('says why when the change is refused, and keeps the old state', async () => {
    renderDialog({
      usage: { status: 200, body: usageBody() }, portal: undefined,
      overage: { status: 409, body: { error: 'free-plan', detail: 'The Free plan has no overage billing.' } },
    });
    await submitCode();
    await userEvent.click(await screen.findByTestId('overage-switch'));
    await userEvent.click(screen.getByTestId('overage-confirm-button'));
    expect(await screen.findByTestId('overage-error')).toHaveTextContent('The Free plan has no overage billing.');
    await userEvent.click(screen.getByTestId('overage-cancel'));
    expect(screen.getByTestId('overage-switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('shows the policy error instead of meters it cannot explain', async () => {
    renderDialog({ usage: { status: 200, body: usageBody() }, portal: undefined, policy: { status: 200, body: { terms: {} } } });
    await submitCode();
    expect(await screen.findByTestId('billing-policy-error')).toHaveTextContent(/billing policy/);
    expect(screen.queryByTestId('usage-meters')).toBeNull();
    expect(screen.queryByTestId('overage-switch')).toBeNull();
  });
});
