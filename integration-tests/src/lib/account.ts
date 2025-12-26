/**
 * Account management operations
 */

import type { Page } from 'playwright';
import type { CreateAccountOptions } from './types.js';
import { config } from './config.js';
import { sleep } from './utils.js';
import { closeAnyModals, checkForErrors, waitForWorkspaceLoaded } from './modals.js';
import { takeScreenshot } from './screenshots.js';
import { clearBrowserStorage } from './browser.js';

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

  await page.goto(config.BASE_URL);

  // CRITICAL: Clear all browser storage after navigation to avoid stale session/peer data
  // from previous test runs. This prevents P2PAutoConnect from trying to connect to
  // non-existent peers from old sessions.
  await clearBrowserStorage(page);

  // Reload the page to ensure the app starts fresh without stale state
  await page.reload();
  await sleep(2000);

  // Click "Join Workspace" button
  const joinBtn = page.locator('button:has-text("Join Workspace")');
  if (await joinBtn.isVisible()) {
    await joinBtn.click();
    await sleep(1000);
  }

  // Step 1: Fill workspace location
  const serverInput = page.locator('#serverAddress');
  await serverInput.fill(config.WORKSPACE_SERVER);
  await sleep(500);

  // Click NEXT to go to Security Settings
  let nextBtn = page.locator('button:has-text("NEXT")');
  await nextBtn.click();
  await sleep(2000);

  // Step 2: Security Settings - just click NEXT
  const securityTitle = page.locator('text="Security Settings"');
  if (await securityTitle.isVisible({ timeout: 2000 }).catch(() => false)) {
    nextBtn = page.locator('button:has-text("NEXT")');
    await nextBtn.click();
    await sleep(2000);
  }

  // Step 3: User Details form
  const fullNameInput = page.locator('input#fullName');
  if (await fullNameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await fullNameInput.fill(username);
    await sleep(300);

    const usernameInput = page.locator('input#username');
    if (await usernameInput.isVisible()) {
      await usernameInput.fill(username);
      await sleep(300);
    }

    const passwordInput = page.locator('input#password');
    const confirmPasswordInput = page.locator('input#confirmPassword');

    if (await passwordInput.isVisible()) {
      await passwordInput.fill(password);
      await sleep(300);
    }
    if (await confirmPasswordInput.isVisible()) {
      await confirmPasswordInput.fill(password);
      await sleep(300);
    }

    const submitBtn = page.locator('button:has-text("Register"), button:has-text("Create Account"), button[type="submit"]').first();
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

      const initBtn = page.locator('button:has-text("Initialize Workspace")');
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
