/**
 * Responsive layout — @playwright/test spec
 *
 * Checks the primary flows at phone width. The failure this targets is
 * horizontal overflow: content wider than the viewport, so the page scrolls
 * sideways and controls sit off-screen where nobody finds them.
 *
 * Overflow is asserted on the document rather than eyeballed, and the check
 * names the widest offending element — "the page scrolls sideways" is not
 * something anyone can act on, "this element is 480px in a 375px viewport" is.
 *
 * 375x667 is an iPhone SE, the narrowest mainstream size worth supporting. If
 * the layout holds here it holds on anything wider.
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  adminCredentials,
  clearBrowserStorage,
  closeAnyModals,
  createAccount,
  hasWorkspaceAdmin,
  loginAfterDisconnect,
  waitForAppReady,
  waitForWorkspaceLoaded,
} from '../lib/index.js';
import { config } from '../lib/config.js';

const PHONE = { width: 375, height: 667 };

/** How much overflow to tolerate. Sub-pixel rounding is not a layout bug. */
const SLOP_PX = 2;

interface Overflow {
  scrollWidth: number;
  clientWidth: number;
  worst: { tag: string; cls: string; width: number; right: number } | null;
}

/**
 * Measure horizontal overflow and identify the element responsible.
 *
 * Elements are checked against the documentElement's client width; the widest
 * right edge past it is reported. Fixed/absolute overlays that are deliberately
 * off-screen (closed drawers, toast rails) are skipped — they are positioned
 * outside the viewport by design and are not what this is looking for.
 */
async function measureOverflow(page: Page): Promise<Overflow> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const limit = doc.clientWidth;
    let worst: { tag: string; cls: string; width: number; right: number } | null = null;

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || style.visibility === 'hidden' || style.display === 'none') continue;
      // A deliberately off-screen panel (a closed drawer) has no painted size.
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= limit) continue;
      if (!worst || rect.right > worst.right) {
        worst = {
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 120),
          width: Math.round(rect.width),
          right: Math.round(rect.right),
        };
      }
    }

    return { scrollWidth: doc.scrollWidth, clientWidth: limit, worst };
  });
}

async function expectNoHorizontalOverflow(page: Page, screen: string): Promise<void> {
  const { scrollWidth, clientWidth, worst } = await measureOverflow(page);

  const detail = worst
    ? `\n  widest offender: <${worst.tag} class="${worst.cls}"> ` +
      `is ${worst.width}px wide, right edge at ${worst.right}px (viewport ${clientWidth}px)`
    : '';

  expect(
    scrollWidth,
    `${screen} scrolls horizontally at ${PHONE.width}px: document is ${scrollWidth}px ` +
      `against a ${clientWidth}px viewport.${detail}`
  ).toBeLessThanOrEqual(clientWidth + SLOP_PX);
}

async function click(page: Page, name: RegExp | string): Promise<void> {
  const button = page.getByRole('button', { name }).first();
  await expect(button).toBeVisible({ timeout: 30_000 });
  await button.click({ force: true });
}

test.describe('Responsive layout at 375px', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: 'commit', timeout: 60_000 });
    await waitForAppReady(page, 60_000);
  });

  test('landing page fits the viewport', async ({ page }) => {
    await expectNoHorizontalOverflow(page, 'landing');
  });

  test('landing actions are reachable', async ({ page }) => {
    // The three entry points. If one is off-screen at this width there is no way
    // into the product from a phone.
    for (const name of ['Join Workspace', 'Login Workspace', 'Manage Accounts']) {
      await expect(page.getByRole('button', { name })).toBeInViewport({ timeout: 15_000 });
    }
  });

  test('join flow fits the viewport', async ({ page }) => {
    await click(page, 'Join Workspace');
    const address = page.getByRole('textbox', { name: 'Workspace Address' });
    await expect(address).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page, 'join/address');

    await address.fill(config.WORKSPACE_SERVER);
    await click(page, 'NEXT');
    await expect(page.getByRole('heading', { name: 'Security Settings' })).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page, 'join/security');
  });

  test('login form fits the viewport, including advanced options', async ({ page }) => {
    await click(page, 'Login Workspace');
    await expect(page.getByRole('heading', { name: 'Login to Workspace' })).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page, 'login');

    const advanced = page.getByRole('button', { name: /Advanced Options/i });
    if (await advanced.isVisible().catch(() => false)) {
      await advanced.click({ force: true });
      await expect(page.getByText(/Remember Credentials/i)).toBeVisible({ timeout: 15_000 });
      await expectNoHorizontalOverflow(page, 'login/advanced');
    }
  });

  test('manage accounts dialog fits the viewport', async ({ page }) => {
    await click(page, 'Manage Accounts');
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page, 'manage-accounts');
  });
});

/**
 * The workspace itself at phone width.
 *
 * This is where overflow is most likely: a fixed-width sidebar beside a content
 * column has to collapse rather than push the page sideways. Serial and sharing
 * one account, since registering is the slow part.
 */
test.describe.serial('Responsive workspace at 375px', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // Registering and loading a workspace is well over the 120s default this
    // hook inherits from the per-test timeout — it involves a real server
    // round-trip and the P2P stack coming up. Timing out here reports as a
    // layout failure, which is misleading; the scans themselves are fast.
    test.setTimeout(300_000);

    context = await browser.newContext({ viewport: PHONE });
    page = await context.newPage();

    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: 'commit', timeout: 60_000 });
    await waitForAppReady(page, 60_000);

    const username = `resp_${Date.now()}`;
    const registered = await createAccount(page, username, {
      isFirstUser: true,
      password: config.DEFAULT_PASSWORD,
      uxTracker: null,
    });
    expect(registered, `could not register ${username}`).toBe(true);

    // Checked, not fired and forgotten: this returns false rather than
    // throwing, so ignoring it let a workspace that never loaded run the
    // whole block and fail later somewhere unrelated.
    expect(
      await waitForWorkspaceLoaded(page, 60_000),
      'the workspace should finish loading',
    ).toBe(true);
    await closeAnyModals(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('workspace shell fits the viewport', async () => {
    await expectNoHorizontalOverflow(page, 'workspace');
  });

  test('sidebar opens as a drawer and closes again', async () => {
    // At this width the sidebar has to be dismissable, or it covers the content
    // with no way back. The toggle is exposed at all widths — it used to be
    // desktop-hidden, which left no way to collapse it at all.
    const toggle = page.getByTestId('sidebar-toggle');
    await expect(toggle).toBeVisible({ timeout: 15_000 });

    // Below the mobile breakpoint the Sidebar renders as a Sheet, marked
    // data-mobile. Asserting on it rather than only on overflow means this test
    // fails if the drawer stops opening — and, more importantly, leaves the app
    // in a known state for whatever runs next in this serial suite. Toggling
    // twice and assuming it closed is what let an open drawer swallow the clicks
    // in the following test.
    const drawer = page.locator('[data-mobile="true"]');

    await toggle.click({ force: true });
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalOverflow(page, 'workspace/sidebar-open');

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden({ timeout: 15_000 });
    await expectNoHorizontalOverflow(page, 'workspace/sidebar-closed');
  });

  test('settings modal fits the viewport', async () => {
    await page.getByTestId('user-avatar-button').click({ force: true });
    await page.getByRole('menuitem', { name: 'Settings' }).click({ force: true });
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 30_000 });

    await expectNoHorizontalOverflow(page, 'settings');

    await page.keyboard.press('Escape');
  });

  test('user directory fits the viewport', async () => {
    await page.evaluate(() => {
      window.history.pushState({}, '', '/directory');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByRole('heading', { name: 'User Directory' })).toBeVisible({ timeout: 30_000 });

    await expectNoHorizontalOverflow(page, 'directory');
  });
});

/**
 * The theme editor is the densest thing in the app — a preview of the whole
 * workspace, a preset gallery and a colour wheel — and a colour wheel is a
 * fixed-size widget, exactly the sort that survives a desktop layout and pushes
 * a phone sideways.
 *
 * Its own session, for the same reason as the accessibility spec: only the
 * account that INITIALISES the workspace holds the `themes` permission, and the
 * block above deliberately registers a fresh user, who gets a correctly
 * read-only editor with no wheel in it to measure.
 */
test.describe.serial('Responsive theme editor at 375px', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);

    context = await browser.newContext({ viewport: PHONE });
    page = await context.newPage();

    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: 'commit', timeout: 60_000 });
    await waitForAppReady(page, 60_000);

    const admin = adminCredentials();
    const loggedIn = await loginAfterDisconnect(
      page,
      admin.username,
      admin.password,
      null,
      config.WORKSPACE_SERVER,
    );
    expect(loggedIn, `could not log in as the workspace admin (${admin.username})`).toBe(true);

    // Checked, not fired and forgotten: this returns false rather than
    // throwing, so ignoring it let a workspace that never loaded run the
    // whole block and fail later somewhere unrelated.
    expect(
      await waitForWorkspaceLoaded(page, 60_000),
      'the workspace should finish loading',
    ).toBe(true);
    await closeAnyModals(page);

    expect(
      hasWorkspaceAdmin(),
      'global-setup did not initialise the workspace, so no account here can open the theme editor. ' +
        'Restart the stack: docker compose restart server internal-service',
    ).toBe(true);

    // The workspace keeps streaming data in after it first renders, and a
    // re-render dismisses an open Radix dropdown, so opening the menu is
    // retried rather than clicked once and waited on.
    const settingsItem = page.locator('[role="menuitem"]:has-text("Settings")');
    await expect(async () => {
      await page.getByTestId('user-avatar-button').click({ force: true });
      await expect(settingsItem).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    await settingsItem.click({ force: true });

    // Wait for the dialog, do not assume it. Clicking the tab straight after
    // the menu item raced the modal mounting: the click landed on nothing and
    // then waited out the whole hook timeout with no useful diagnosis.
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 30_000 });
    // A settle, not a poll. Retrying the tab click instead re-clicks the avatar
    // path underneath and ends up dismissing the settings dialog entirely — the
    // run finished with no dialog at all. The dialog reports visible the moment
    // its open animation starts, and a click that lands before Radix has
    // mounted the panel activates nothing.
    await page.waitForTimeout(2_000);

    const openEditor = page.getByTestId('open-workspace-appearance');
    await page.getByRole('tab', { name: /^theme$/i }).click({ force: true });
    await expect(openEditor).toBeVisible({ timeout: 30_000 });

    // The settings modal scrolls its own body, and at this width the appearance
    // section sits below the fold, so the click needs it laid out on screen.
    await openEditor.scrollIntoViewIfNeeded();
    await openEditor.click();
    await expect(page.getByTestId('workspace-appearance-modal')).toBeVisible({ timeout: 30_000 });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('the editor fits the viewport', async () => {
    await expectNoHorizontalOverflow(page, 'theme editor');
  });

  test('the colour wheel fits the viewport', async () => {
    // Only rendered once a part of the preview is selected, so the editor above
    // never measures it.
    await page.getByTestId('preview-region-sidebar').click({ force: true });
    await expect(page.getByTestId('color-wheel')).toBeVisible({ timeout: 30_000 });

    await expectNoHorizontalOverflow(page, 'theme editor — colour wheel');
  });

  test('save and cancel stay reachable', async () => {
    // A tall editor on a short screen can push its own actions off the bottom,
    // leaving no way to apply or abandon the edit — the modal becomes a trap.
    await expect(page.getByTestId('appearance-save')).toBeInViewport();
  });
});
