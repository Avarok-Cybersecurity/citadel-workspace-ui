/**
 * The production first-run onboarding, and the promise that it costs the suite
 * nothing.
 *
 * `isOnboardingEnabled` (src/lib/debug-config.ts) is OFF in development. That
 * is the whole reason this feature is affordable: the suite creates an account
 * for nearly every spec at 9 UI interactions each -- 11 for the first user --
 * and a dialog on top of that would be clicked through roughly 90 times per
 * run to assert nothing.
 *
 * So the first test here is not about onboarding at all. It asserts the
 * ABSENCE, because a gate that quietly turned on would slow every other spec
 * and nothing else would notice; the suite would just get more expensive.
 *
 * The rest opt in with `?onboarding=1`, which is how production behaviour is
 * exercised without a production build. These run entirely client-side -- no
 * account is registered -- so they neither contend for the shared backend nor
 * leave state behind.
 */

import { test, expect, type Page } from '@playwright/test';
import { waitForAppReady } from '../lib/index.js';
import { config } from '../lib/config.js';

async function openLanding(page: Page, query: string = ''): Promise<void> {
  await page.goto(`${config.BASE_URL}${query}`, { waitUntil: 'commit', timeout: 60_000 });
  await waitForAppReady(page, 60_000);
}

async function clickCreateAccount(page: Page): Promise<void> {
  const btn = page.getByTestId('create-account-button');
  await btn.waitFor({ state: 'visible', timeout: 30_000 });
  await btn.click({ force: true });
}

test.describe('First-run onboarding', () => {
  test('is absent in the environment the suite runs in', async ({ page }) => {
    await openLanding(page);
    await clickCreateAccount(page);

    // Straight to the wizard. If this ever fails, every other spec in the
    // suite just became two interactions more expensive.
    await expect(
      page.getByRole('textbox', { name: 'Workspace Address' }),
      'dev must go straight to the wizard — onboarding is production-only',
    ).toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId('onboarding-intent')).toHaveCount(0);
  });

  test('a new administrator is told about the master password before the wizard', async ({ page }) => {
    await openLanding(page, '?onboarding=1');
    await clickCreateAccount(page);

    const dialog = page.getByTestId('onboarding-intent');
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    // The defect this exists to fix: WORKSPACE_MASTER_PASSWORD was first named
    // in a modal shown AFTER the account was created. Assert it is named here,
    // on the administrator's path, before anything is typed.
    const adminChoice = page.getByTestId('onboarding-intent-admin');
    await expect(adminChoice).toBeVisible();
    await expect(
      adminChoice,
      'the administrator path must name the master password before the wizard',
    ).toContainText(/master password/i);

    await adminChoice.click();

    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole('textbox', { name: 'Workspace Address' }),
      'choosing a path must not change the wizard that follows',
    ).toBeVisible({ timeout: 30_000 });
  });

  test('a new member is told they do NOT need the master password', async ({ page }) => {
    await openLanding(page, '?onboarding=1');
    await clickCreateAccount(page);

    const memberChoice = page.getByTestId('onboarding-intent-member');
    await expect(memberChoice).toBeVisible({ timeout: 30_000 });

    // A member who arrives before anyone has initialised is shown the
    // initialisation modal asking for a secret they cannot obtain. Saying so
    // here is the difference between a confusing prompt and an expected one.
    await expect(
      memberChoice,
      'the member path must say the master password is not theirs to supply',
    ).toContainText(/do not need the master password/i);

    await memberChoice.click();
    await expect(page.getByTestId('onboarding-intent')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Workspace Address' })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('skipping proceeds to the same wizard', async ({ page }) => {
    await openLanding(page, '?onboarding=1');
    await clickCreateAccount(page);

    await page.getByTestId('onboarding-intent-skip').click();
    await expect(page.getByTestId('onboarding-intent')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Workspace Address' })).toBeVisible({
      timeout: 30_000,
    });
  });

  // The off-switch is what lets a production Playwright run build its fixture
  // accounts cheaply and opt in only where onboarding is the subject. Untested,
  // a production suite would silently pay for the dialog on every setup account.
  test('?onboarding=0 suppresses it even where it would otherwise show', async ({ page }) => {
    await openLanding(page, '?onboarding=1');
    await clickCreateAccount(page);
    await expect(page.getByTestId('onboarding-intent')).toBeVisible({ timeout: 30_000 });

    await openLanding(page, '?onboarding=0');
    await clickCreateAccount(page);
    await expect(
      page.getByTestId('onboarding-intent'),
      'the explicit off-switch must win',
    ).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Workspace Address' })).toBeVisible({
      timeout: 30_000,
    });
  });
});
