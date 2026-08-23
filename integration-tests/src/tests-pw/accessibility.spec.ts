/**
 * Accessibility — @playwright/test spec
 *
 * Runs axe-core against the screens a new user meets before they have an
 * account: the landing page, the join flow, and the login form. These are the
 * first-run surfaces, so a barrier here blocks someone from ever reaching the
 * product.
 *
 * Gated on `serious` and `critical` impact only. `minor` and `moderate` are
 * reported to the log but not failed on — they are dominated by contrast
 * suggestions and best-practice advice that would make this spec a running
 * argument with the designer rather than a defect gate. Anything that actually
 * stops a keyboard or screen-reader user lands in the two levels asserted here.
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { Result } from 'axe-core';
import {
  clearBrowserStorage,
  closeAnyModals,
  createAccount,
  waitForAppReady,
  waitForWorkspaceLoaded,
} from '../lib/index.js';
import { config } from '../lib/config.js';

/** WCAG 2.1 A and AA. The level a product is normally held to. */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const BLOCKING = new Set(['serious', 'critical']);

async function freshPage(page: Page): Promise<void> {
  await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
  await clearBrowserStorage(page);
  await page.reload({ waitUntil: 'commit', timeout: 60_000 });
  await waitForAppReady(page, 60_000);
}

/**
 * Wait for running CSS animations and transitions to finish.
 *
 * axe composites the colours it measures, so scanning during a fade-in reads the
 * blended value rather than the real one. That produced three different contrast
 * ratios for the SAME button on three screens (3.7, 3.88, 4.1) — a measurement
 * artefact that would have sent us to change a colour that is fine at rest.
 *
 * Waits on document.getAnimations() rather than a fixed delay, so it returns the
 * moment the page is actually still.
 */
async function settleAnimations(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.getAnimations().every((a) => a.playState === 'finished' || a.playState === 'idle'),
    undefined,
    { timeout: 15_000 }
  ).catch(() => {
    // An indefinite animation (a spinner, a pulse) never finishes. Scanning
    // anyway is better than failing the a11y check over it; the report names the
    // element either way.
    console.log(`[a11y] animations still running; scanning anyway`);
  });
}

/**
 * Scan the current page and fail on anything of serious or critical impact.
 *
 * Reports the offending selector and the rule's help URL, because "3 violations"
 * in a CI log is not something anyone can act on.
 */
async function expectNoBlockingViolations(page: Page, screen: string): Promise<void> {
  await settleAnimations(page);

  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();

  const blocking = violations.filter((v: Result) => BLOCKING.has(v.impact ?? ''));
  const advisory = violations.filter((v: Result) => !BLOCKING.has(v.impact ?? ''));

  if (advisory.length) {
    console.log(
      `[a11y] ${screen}: ${advisory.length} advisory (not gated): ` +
        advisory.map((v: Result) => `${v.id}(${v.impact})`).join(', ')
    );
  }

  const detail = blocking
    .map((v: Result) => {
      // The element's markup and axe's explanation, not just a class name. A CI
      // log saying `.h-10` names nothing anyone can act on; the html and the
      // measured contrast ratio do.
      const nodes = v.nodes
        .slice(0, 3)
        .map((n) => {
          const why = (n.any?.[0]?.message ?? n.all?.[0]?.message ?? '').replace(/\s+/g, ' ');
          return `      at: ${String(n.target.join(' '))}\n      html: ${n.html.slice(0, 200)}` +
            (why ? `\n      why: ${why}` : '');
        })
        .join('\n');
      return `  ${v.impact} ${v.id}: ${v.help}\n${nodes}\n    see: ${v.helpUrl}`;
    })
    .join('\n');

  expect(blocking, `${screen} has blocking accessibility violations:\n${detail}`).toEqual([]);
}

/** Click without waiting for stability — the app re-renders while leader election settles. */
async function click(page: Page, name: RegExp | string): Promise<void> {
  const button = page.getByRole('button', { name }).first();
  await expect(button).toBeVisible({ timeout: 30_000 });
  await button.click({ force: true });
}

test.describe('Accessibility (first-run surfaces)', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
  });

  test('landing page', async ({ page }) => {
    await expectNoBlockingViolations(page, 'landing');
  });

  test('join workspace — address step', async ({ page }) => {
    await click(page, 'Join Workspace');
    await expect(page.getByRole('textbox', { name: 'Workspace Address' })).toBeVisible({ timeout: 30_000 });
    await expectNoBlockingViolations(page, 'join/address');
  });

  test('join workspace — security step', async ({ page }) => {
    await click(page, 'Join Workspace');
    const address = page.getByRole('textbox', { name: 'Workspace Address' });
    await expect(address).toBeVisible({ timeout: 30_000 });
    await address.fill(config.WORKSPACE_SERVER);
    await click(page, 'NEXT');

    await expect(page.getByRole('heading', { name: 'Security Settings' })).toBeVisible({ timeout: 30_000 });
    await expectNoBlockingViolations(page, 'join/security');
  });

  test('login form, including advanced options', async ({ page }) => {
    await click(page, 'Login Workspace');
    await expect(page.getByRole('heading', { name: 'Login to Workspace' })).toBeVisible({ timeout: 30_000 });

    // Expand Advanced Options too: the controls it hides (server address,
    // Configure, Remember Credentials) are part of this screen and would
    // otherwise never be scanned.
    const advanced = page.getByRole('button', { name: /Advanced Options/i });
    if (await advanced.isVisible().catch(() => false)) {
      await advanced.click({ force: true });
    }

    await expectNoBlockingViolations(page, 'login');
  });

  test('manage accounts dialog', async ({ page }) => {
    await click(page, 'Manage Accounts');
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 30_000 });
    await expectNoBlockingViolations(page, 'manage-accounts');
  });
});

/**
 * The screens a user spends their time on, once they are in.
 *
 * Serial, sharing one page and one account: registering is the slow part, and
 * scanning five screens does not need five accounts. Each test navigates from
 * wherever the last one left off.
 */
test.describe.serial('Accessibility (authenticated surfaces)', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // Registering and loading a workspace is well over the 120s default this
    // hook inherits from the per-test timeout — it involves a real server
    // round-trip and the P2P stack coming up. Timing out here reports as a
    // layout failure, which is misleading; the scans themselves are fast.
    test.setTimeout(300_000);

    // newContext, not browser.newPage(): the latter creates an implicit context
    // and axe refuses to run in one ("Please use browser.newContext()").
    context = await browser.newContext();
    page = await context.newPage();
    await freshPage(page);

    const username = `a11y_${Date.now()}`;
    const registered = await createAccount(page, username, {
      isFirstUser: true,
      password: config.DEFAULT_PASSWORD,
      uxTracker: null,
    });
    expect(registered, `could not register ${username}`).toBe(true);

    await waitForWorkspaceLoaded(page, 60_000);
    await closeAnyModals(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('workspace shell', async () => {
    await expectNoBlockingViolations(page, 'workspace');
  });

  test('settings modal', async () => {
    await page.getByTestId('user-avatar-button').click({ force: true });
    await page.getByRole('menuitem', { name: 'Settings' }).click({ force: true });
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 30_000 });

    await expectNoBlockingViolations(page, 'settings');

    await page.keyboard.press('Escape');
  });

  test('notification centre', async () => {
    await page.locator('button:has(svg.lucide-bell)').first().click({ force: true });
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 30_000 });

    await expectNoBlockingViolations(page, 'notifications');

    await page.keyboard.press('Escape');
  });

  test('user directory', async () => {
    await page.evaluate(() => {
      window.history.pushState({}, '', '/directory');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByRole('heading', { name: 'User Directory' })).toBeVisible({ timeout: 30_000 });

    await expectNoBlockingViolations(page, 'directory');
  });
});
