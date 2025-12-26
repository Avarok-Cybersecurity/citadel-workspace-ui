/**
 * Modal and dialog utilities
 */

import type { Page } from 'playwright';
import { sleep } from './utils.js';
import { UxIssueTracker } from './ux-tracker.js';

/**
 * Close any open modals by pressing Escape
 */
export async function closeAnyModals(page: Page, maxAttempts = 3): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const backdrop = page.locator('.bg-black\\/60, [data-state="open"]').first();
    if (await backdrop.isVisible({ timeout: 300 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await sleep(300);
    } else {
      break;
    }
  }
}

/**
 * Check for error toasts or messages on the page
 */
export async function checkForErrors(page: Page, context: string, uxTracker: UxIssueTracker | null = null): Promise<boolean> {
  const errorToast = page.locator('[role="alert"]:has-text("error"), [role="alert"]:has-text("failed")').first();
  if (await errorToast.isVisible({ timeout: 500 }).catch(() => false)) {
    const errorText = await errorToast.textContent();
    if (uxTracker && errorText) {
      uxTracker.log('critical', 'functional', `Error in ${context}: ${errorText}`);
    }
    console.log(`  ERROR in ${context}: ${errorText}`);
    return true;
  }
  return false;
}

/**
 * Wait for workspace to fully load
 * Looks for various sidebar section headers that indicate workspace is ready
 */
export async function waitForWorkspaceLoaded(page: Page, timeout = 60000): Promise<boolean> {
  console.log('  Waiting for workspace to fully load...');
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const loadingIndicator = page.locator('text="Loading workspace..."');
    const isLoading = await loadingIndicator.isVisible({ timeout: 500 }).catch(() => false);

    if (!isLoading) {
      // Look for any of the sidebar section headers that indicate workspace is loaded
      // Note: "CONNECTED PEERS" appears when there are P2P peers but no workspace members
      const sidebarIndicators = [
        'text="WORKSPACE MEMBERS"',
        'text="CONNECTED PEERS"',
        'text="DIRECT MESSAGES"',
        'text="FILES"',
      ];

      for (const selector of sidebarIndicators) {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 500 }).catch(() => false)) {
          console.log('  Workspace fully loaded');
          return true;
        }
      }
    }

    await sleep(1000);
  }

  console.log('  Workspace loading timeout');
  return false;
}
