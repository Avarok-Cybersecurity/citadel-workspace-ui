/**
 * Account management operations
 */

import type { Page } from 'playwright';
import type { CreateAccountOptions } from './types.js';
import { config } from './config.js';
import { closeAnyModals, waitForWorkspaceLoaded } from './modals.js';
import { takeScreenshot } from './screenshots.js';
import { clearBrowserStorage, waitForAppReady } from './browser.js';
import { isVisibleWithin } from './utils.js';

/**
 * Create a new user account
 */
export async function createAccount(page: Page, username: string, options: CreateAccountOptions = {}): Promise<boolean> {
  const {
    isFirstUser = false,
    password = config.DEFAULT_PASSWORD,
    uxTracker = null,
  } = options;

  console.log(`\n=== Creating account: ${username} ===`);

  // Use 'commit' instead of 'load' because WASM loading can take a long time.
  // On cold start, Vite dev server optimizes dependencies which can take 10-30s.
  await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60000 });

  // Wait for the React app to actually render (handles Vite cold start)
  await waitForAppReady(page, 60000);

  // CRITICAL: Clear all browser storage after navigation to avoid stale session/peer data
  // from previous test runs. This prevents P2PAutoConnect from trying to connect to
  // non-existent peers from old sessions.
  await clearBrowserStorage(page);

  // Reload the page to ensure the app starts fresh without stale state.
  // Second load should be fast since Vite deps are already optimized.
  await page.reload({ waitUntil: 'commit', timeout: 60000 });
  await waitForAppReady(page, 30000);

  // Click "Join Workspace" button
  // Use force:true to bypass Playwright's stability check. In multi-tab tests,
  // BroadcastChannel leader election can cause continuous re-renders that keep
  // the button "not stable" indefinitely.
  const joinBtn = page.locator('button:has-text("Join Workspace")');
  if (await isVisibleWithin(joinBtn, 5000)) {
    await joinBtn.click({ force: true });
  }

  // Step 1: Fill workspace address (using role-based selector)
  const serverInput = page.getByRole('textbox', { name: 'Workspace Address' });
  if (await isVisibleWithin(serverInput, 5000)) {
    await serverInput.fill(config.WORKSPACE_SERVER);

    // Click NEXT to go to Security Settings
    const nextBtn = page.getByRole('button', { name: 'NEXT' });
    await nextBtn.click();
  }

  // Step 2: Security Settings - just click NEXT
  const securityTitle = page.locator('text="Security Settings"');
  if (await isVisibleWithin(securityTitle, 3000)) {
    const nextBtn = page.getByRole('button', { name: 'NEXT' });
    await nextBtn.click();
  }

  // Sonner renders a rejection as `<li data-sonner-toast data-type="error">` and
  // sets NO role="alert" — the selector this file shared with checkForErrors
  // matched nothing at all, in every spec in the suite.
  const errorToast = page
    .locator(
      '[data-sonner-toast][data-type="error"], ' +
        '[role="alert"]:has-text("error"), [role="alert"]:has-text("failed")',
    )
    .first();

  type Rejection = { kind: 'rejected'; detail: string } | { kind: 'no-error'; detail: string };
  let rejection: Promise<Rejection> = Promise.resolve({ kind: 'no-error', detail: '' });

  // Step 3: User Details form (Create Your Profile)
  const fullNameInput = page.getByRole('textbox', { name: 'Full Name' });
  if (await isVisibleWithin(fullNameInput, 5000)) {
    await fullNameInput.fill(username);

    const usernameInput = page.getByRole('textbox', { name: 'Username' });
    if (await usernameInput.isVisible()) {
      await usernameInput.fill(username);
    }

    const passwordInput = page.getByRole('textbox', { name: 'Profile Password', exact: true });
    const confirmPasswordInput = page.getByRole('textbox', { name: 'Confirm Profile Password' });

    if (await passwordInput.isVisible()) {
      await passwordInput.fill(password);
    }
    if (await confirmPasswordInput.isVisible()) {
      await confirmPasswordInput.fill(password);
    }

    // Click Join button (not Register/Create Account)
    const submitBtn = page.getByRole('button', { name: 'Join', exact: true });
    if (await submitBtn.isVisible()) {
      // Armed BEFORE the click. The toast lands ~2.5s after submit and Sonner
      // auto-dismisses it ~4s later, so any watcher started after the race
      // below is looking for something that has already gone. The text is
      // captured the instant it becomes visible for the same reason.
      // 15s, not 30: the toast lands ~2.5s after submit, so this is already 6x
      // the observed latency, and every extra second is a Playwright poll loop
      // running per context — three of them at once in the group-call specs.
      rejection = errorToast
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(async () => ({
          kind: 'rejected' as const,
          detail: (await errorToast.textContent().catch(() => null))?.trim() ?? 'unknown error',
        }))
        .catch(() => ({ kind: 'no-error' as const, detail: '' }));

      await submitBtn.click();
      // Registration is a server round trip, so this genuinely has to wait — but
      // for the OUTCOME, not for a fixed 8s. Exactly one of two things follows:
      // the Initialize Workspace modal (this is the first account on the server)
      // or navigation into the workspace. Racing them returns as soon as either
      // lands, and still fails loudly if neither does.
      await Promise.race([
        page.locator('input#masterPassword').waitFor({ state: 'visible', timeout: 30_000 }),
        page.waitForURL(/\/(workspace|office)/, { timeout: 30_000 }),
        // A refused registration produces NEITHER of the above, so without this
        // arm the helper sat out the full 30s and then another 45s downstream.
        rejection.then((r) => (r.kind === 'rejected' ? undefined : new Promise<never>(() => {}))),
      ]).catch(() => {
        // Neither arrived; waitForWorkspaceLoaded below reports the real failure
        // with more context than a timeout here would.
      });
    }
  }

  // Handle Initialize Workspace modal (only for first user)
  if (isFirstUser) {
    const passwordField = page.locator('input#masterPassword');
    // waitFor, NOT isVisible({ timeout }) — Playwright ignores that option, so
    // this was an immediate snapshot taken right after registration. A genuinely
    // first user whose modal had not rendered yet would silently skip
    // initialisation and end up a NON-ADMIN, which then surfaces much later as
    // "Permission denied: EditTreeStructure required" on the first create.
    const modalAppeared = await passwordField
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (modalAppeared) {
      await passwordField.fill(config.WORKSPACE_PASSWORD);

      const initBtn = page.locator('button:has-text("Initialize & Become Admin")');
      if (await initBtn.isVisible()) {
        await initBtn.click();
        // Wait for the modal to actually close rather than a flat 5s — that is
        // the signal that the server accepted the initialisation.
        await passwordField.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {
          // Still open: waitForWorkspaceLoaded below surfaces it properly.
        });
      }
    }
  }

  // The server can reject a registration outright — the SDK enforces a
  // credential contract (3-37 char username, 7-17 char password, no spaces)
  // and a duplicate username is refused. This used to return an unconditional
  // `true`, so every caller's `expect(await createAccount(...)).toBe(true)`
  // asserted a constant: a run whose registration was refused reported success
  // and then failed later somewhere unrelated, with the cause long scrolled off.
  //
  // The watcher for that rejection is armed before the submit click above, not
  // here: closeAnyModals presses Escape, which dismisses Sonner toasts, and the
  // 30s post-submit race outlives the toast entirely.

  await closeAnyModals(page);

  // Raced against the success signal so a working registration pays nothing.
  const outcome = await Promise.race([
    rejection,
    waitForWorkspaceLoaded(page, 45000).then((ok) => ({
      kind: ok ? ('loaded' as const) : ('not-loaded' as const),
      detail: '',
    })),
  ]);

  if (outcome.kind === 'rejected') {
    if (uxTracker) {
      uxTracker.log('critical', 'functional', `Registration rejected for ${username}: ${outcome.detail}`);
    }
    await takeScreenshot(page, `${username}_registration_rejected`);
    console.log(`  Account ${username} was REJECTED: ${outcome.detail}`);
    return false;
  }

  if (outcome.kind !== 'loaded') {
    console.log('  WARNING: Workspace may not have fully loaded');
  }

  await takeScreenshot(page, `${username}_created`);
  console.log(`  Account ${username} created`);
  return true;
}
