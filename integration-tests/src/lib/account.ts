/**
 * Account management operations
 */

import type { Page } from 'playwright';
import type { CreateAccountOptions } from './types.js';
import { config } from './config.js';
import { sleep } from './utils.js';
import { closeAnyModals, checkForErrors, waitForWorkspaceLoaded } from './modals.js';
import { takeScreenshot } from './screenshots.js';
import { clearBrowserStorage, waitForAppReady } from './browser.js';

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
  if (await joinBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await joinBtn.click({ force: true });
    await sleep(1000);
  }

  // Step 1: Fill workspace address (using role-based selector)
  const serverInput = page.getByRole('textbox', { name: 'Workspace Address' });
  if (await serverInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await serverInput.fill(config.WORKSPACE_SERVER);
    await sleep(500);

    // Click NEXT to go to Security Settings
    const nextBtn = page.getByRole('button', { name: 'NEXT' });
    await nextBtn.click();
    await sleep(2000);
  }

  // Step 2: Security Settings - just click NEXT
  const securityTitle = page.locator('text="Security Settings"');
  if (await securityTitle.isVisible({ timeout: 3000 }).catch(() => false)) {
    const nextBtn = page.getByRole('button', { name: 'NEXT' });
    await nextBtn.click();
    await sleep(2000);
  }

  // Step 3: User Details form (Create Your Profile)
  const fullNameInput = page.getByRole('textbox', { name: 'Full Name' });
  if (await fullNameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await fullNameInput.fill(username);
    await sleep(300);

    const usernameInput = page.getByRole('textbox', { name: 'Username' });
    if (await usernameInput.isVisible()) {
      await usernameInput.fill(username);
      await sleep(300);
    }

    const passwordInput = page.getByRole('textbox', { name: 'Profile Password', exact: true });
    const confirmPasswordInput = page.getByRole('textbox', { name: 'Confirm Profile Password' });

    if (await passwordInput.isVisible()) {
      await passwordInput.fill(password);
      await sleep(300);
    }
    if (await confirmPasswordInput.isVisible()) {
      await confirmPasswordInput.fill(password);
      await sleep(300);
    }

    // Click Join button (not Register/Create Account)
    const submitBtn = page.getByRole('button', { name: 'Join', exact: true });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await sleep(8000);
    }
  }

  // Handle Initialize Workspace modal (only for first user)
  if (isFirstUser) {
    const passwordField = page.locator('input#masterPassword');
    if (await passwordField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await passwordField.fill(config.WORKSPACE_PASSWORD);
      await sleep(500);

      const initBtn = page.locator('button:has-text("Initialize & Become Admin")');
      if (await initBtn.isVisible()) {
        await initBtn.click();
        await sleep(5000);
      }
    }
  }

  await closeAnyModals(page);
  await checkForErrors(page, 'account creation', uxTracker);

  // Wait for workspace to load
  const loaded = await waitForWorkspaceLoaded(page, 45000);
  if (!loaded) {
    console.log('  WARNING: Workspace may not have fully loaded');
  }

  await takeScreenshot(page, `${username}_created`);
  console.log(`  Account ${username} created`);
  return true;
}
