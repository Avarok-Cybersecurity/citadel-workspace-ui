/**
 * Error Handling — @playwright/test spec
 *
 * What a user sees when they get something wrong: a registration form filled in
 * incorrectly, and a login for an account that does not exist.
 *
 * Selectors are role + accessible-name (`getByRole('textbox', { name: 'Workspace
 * Address' })`) rather than CSS ids. That is what the working legacy suite uses,
 * it survives restyling, and it only passes if the control is actually labelled —
 * so these double as a check that the form stays reachable to a screen reader.
 *
 * The previous version of this file queried `input#server-address` and
 * `input#server`, neither of which has ever existed (the id is `serverAddress`),
 * and every lookup sat behind an `if (isVisible)` guard. So it did not fail on
 * the missing element — it skipped the whole interaction and asserted against a
 * page nothing had been done to. It went unnoticed because this spec ran in no
 * CI job at all.
 */

import { test, expect, type Page } from '@playwright/test';
import { clearBrowserStorage, waitForAppReady } from '../lib/index.js';
import { config } from '../lib/config.js';

/** A page with no leftover session or peer state from a previous test. */
async function freshPage(page: Page): Promise<void> {
  await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
  await clearBrowserStorage(page);
  await page.reload({ waitUntil: 'commit', timeout: 60_000 });
  await waitForAppReady(page, 60_000);
}

/**
 * Any user-visible error surface: a Sonner error toast, an accessible alert, or
 * inline destructive text. A locator rather than a boolean, so callers can use a
 * web-first assertion instead of polling.
 */
function errorSurface(page: Page) {
  return page
    .locator('[data-sonner-toast][data-type="error"], [role="alert"], .text-red-400, .text-destructive')
    .first();
}

/**
 * Click without waiting for the element to be "stable".
 *
 * The app re-renders continuously while BroadcastChannel leader election settles,
 * so Playwright's actionability check can wait for a button to stop moving until
 * the test times out — observed here as "232 × waiting for element to be visible,
 * enabled and stable". The legacy suite hit the same wall and force-clicks for
 * the same reason. The underlying render churn is tracked in
 * docs/KNOWN_ISSUES.md; forcing here keeps that one problem from failing every
 * unrelated assertion.
 */
async function clickThroughRenderChurn(page: Page, name: RegExp | string) {
  const button = page.getByRole('button', { name }).first();
  await expect(button).toBeVisible();
  await button.click({ force: true });
}

test.describe('Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
  });

  test('mismatched profile passwords are rejected before any account is created', async ({ page }) => {
    await clickThroughRenderChurn(page, 'Join Workspace');

    // Step 1 — workspace address.
    const serverInput = page.getByRole('textbox', { name: 'Workspace Address' });
    await expect(serverInput).toBeVisible();
    await serverInput.fill(config.WORKSPACE_SERVER);
    await clickThroughRenderChurn(page, 'NEXT');

    // Step 2 — security settings are pre-filled; accept the defaults. Matched on
    // the heading because the body copy below it also contains the phrase.
    await expect(page.getByRole('heading', { name: 'Security Settings' })).toBeVisible({ timeout: 15_000 });
    await clickThroughRenderChurn(page, 'NEXT');

    // Step 3 — profile, with deliberately mismatched passwords.
    const fullName = page.getByRole('textbox', { name: 'Full Name' });
    await expect(fullName).toBeVisible({ timeout: 15_000 });
    await fullName.fill('Mismatch Test');
    await page.getByRole('textbox', { name: 'Username' }).fill(`mismatch_${Date.now()}`);
    await page.getByRole('textbox', { name: 'Profile Password', exact: true }).fill('correct-horse');
    await page.getByRole('textbox', { name: 'Confirm Profile Password' }).fill('battery-staple');

    await clickThroughRenderChurn(page, /^Join$/);

    await expect(errorSurface(page)).toBeVisible({ timeout: 15_000 });

    // The real requirement is rejection, not just a message. Reaching the
    // workspace would mean an account was created from a form the app had just
    // called invalid — the failure mode actually worth guarding.
    await expect(page).not.toHaveURL(/\/(workspace|office)/);
  });

  test('logging in as a non-existent user reports the failure', async ({ page }) => {
    await clickThroughRenderChurn(page, 'Login Workspace');

    await page.getByRole('textbox', { name: 'Username' }).fill(`ghost_${Date.now()}`);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('wrong-password');

    // The server address lives behind Advanced Options on the login form. It is
    // pre-filled from storage when a previous session exists; this page is fresh,
    // so it has to be set explicitly.
    const advanced = page.getByRole('button', { name: /Advanced Options/i });
    if (await advanced.isVisible().catch(() => false)) {
      await advanced.click({ force: true });
      const serverInput = page.getByRole('textbox', { name: /Workspace Address|Server/i }).first();
      await expect(serverInput).toBeVisible();
      await serverInput.fill(config.WORKSPACE_SERVER);
    }

    await clickThroughRenderChurn(page, /^Connect$/);

    // The server has to reject the unknown account, so this allows for a round
    // trip rather than expecting an immediate client-side answer.
    await expect(errorSurface(page)).toBeVisible({ timeout: 45_000 });
    await expect(page).not.toHaveURL(/\/(workspace|office)/);

    // Visible is not the same as reported. A sign-in failure rendered into a
    // plain div is announced to nobody: a screen reader user presses Connect,
    // hears nothing, and cannot tell a failure from a request still in flight.
    //
    // Deliberately EXCLUDES the toast. The first version of this accepted any
    // [role="alert"], and a failed login also raises a Sonner toast — so it
    // passed with the inline error's role removed, asserting nothing about the
    // thing it named. The toast is transient and scrolls away; the inline
    // error is what remains on the form, and it is the one that has to carry
    // the live region.
    const inlineAlert = page.locator('[role="alert"]:not([data-sonner-toast])').first();
    await expect(
      inlineAlert,
      'the failure should be announced on the form, not only shown',
    ).toBeVisible({ timeout: 15_000 });
  });
});
