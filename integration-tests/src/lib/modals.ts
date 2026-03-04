/**
 * Modal and dialog utilities
 */

import type { Page } from 'playwright';
import { sleep } from './utils.js';
import { UxIssueTracker } from './ux-tracker.js';

/**
 * Close any open modals by clicking Cancel/Close buttons or pressing Escape.
 * Handles both Radix Dialog modals (Escape works) and raw div overlays
 * like WorkspaceInitializationModal (need to click Cancel button).
 */
export async function closeAnyModals(page: Page, maxAttempts = 5): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    // Check for any visible modal overlay
    const backdrop = page.locator('.bg-black\\/60, [data-state="open"], [role="dialog"]').first();
    if (!await backdrop.isVisible({ timeout: 300 }).catch(() => false)) {
      break; // No modal visible
    }

    console.log(`  closeAnyModals: Modal detected (attempt ${i + 1}/${maxAttempts})`);

    // Strategy 1: Click Cancel or Close button inside the modal
    const cancelBtn = page.locator(
      '.bg-black\\/60 button:has-text("Cancel"), ' +
      '[role="dialog"] button:has-text("Cancel"), ' +
      '[role="dialog"] button:has-text("Close"), ' +
      '[data-state="open"] button[aria-label="Close"]'
    ).first();

    if (await cancelBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      console.log('  closeAnyModals: Clicking Cancel/Close button');
      await cancelBtn.click();
      await sleep(500);
      continue;
    }

    // Strategy 2: Press Escape (works for Radix dialogs)
    console.log('  closeAnyModals: Pressing Escape');
    await page.keyboard.press('Escape');
    await sleep(300);
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
        // Additional indicators - sidebar group labels from the workspace layout
        '[data-sidebar="group-label"]',
        // Office/room navigation elements
        'text="General"',
        // Workspace name in sidebar header
        '[data-testid="workspace-name"]',
      ];

      for (const selector of sidebarIndicators) {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 500 }).catch(() => false)) {
          console.log('  Workspace fully loaded');
          return true;
        }
      }

      // Additional check: if we're on a workspace URL and there's a sidebar element visible
      const currentUrl = page.url();
      if (currentUrl.includes('/workspace') || currentUrl.includes('/office')) {
        const sidebar = page.locator('[data-sidebar="sidebar"], aside, nav').first();
        if (await sidebar.isVisible({ timeout: 300 }).catch(() => false)) {
          // Sidebar is visible - check for any content inside it
          const sidebarText = await sidebar.textContent().catch(() => '');
          if (sidebarText && sidebarText.length > 20) {
            console.log('  Workspace loaded (sidebar with content detected)');
            return true;
          }
        }
      }
    }

    await sleep(1000);
  }

  console.log('  Workspace loading timeout');
  return false;
}

/**
 * Toast state counts - tracks visible toast notifications
 */
export interface ToastState {
  successCount: number;
  errorCount: number;
  warningCount: number;
  totalCount: number;
}

/**
 * Check the current state of toast notifications on the page.
 * Supports both Sonner and Radix UI toast components.
 */
export async function checkToastState(page: Page): Promise<ToastState> {
  // Sonner toast selectors
  const sonnerToasts = page.locator('[data-sonner-toast]');
  const sonnerSuccess = page.locator('[data-sonner-toast][data-type="success"]');
  const sonnerError = page.locator('[data-sonner-toast][data-type="error"]');
  const sonnerWarning = page.locator('[data-sonner-toast][data-type="warning"]');

  // Radix UI toast selectors (fallback)
  const radixToasts = page.locator('[data-radix-toast-viewport] [data-state="open"]');
  const radixDestructive = page.locator('[data-radix-toast-viewport] [data-state="open"].destructive');

  // Count Sonner toasts
  const sonnerTotal = await sonnerToasts.count();
  const sonnerSuccessCount = await sonnerSuccess.count();
  const sonnerErrorCount = await sonnerError.count();
  const sonnerWarningCount = await sonnerWarning.count();

  // Count Radix toasts (if Sonner not in use)
  const radixTotal = await radixToasts.count();
  const radixDestructiveCount = await radixDestructive.count();

  // Combine counts (prefer Sonner if both present)
  if (sonnerTotal > 0) {
    return {
      successCount: sonnerSuccessCount,
      errorCount: sonnerErrorCount,
      warningCount: sonnerWarningCount,
      totalCount: sonnerTotal,
    };
  }

  // Radix fallback - classify destructive as error
  return {
    successCount: radixTotal - radixDestructiveCount,
    errorCount: radixDestructiveCount,
    warningCount: 0,
    totalCount: radixTotal,
  };
}

/**
 * Assert that no conflicting toasts appear (both success AND error visible).
 * This indicates a bug in the response handling - operations shouldn't
 * trigger both success and error simultaneously.
 *
 * @returns true if no conflict (test should continue), false if conflict detected
 * @throws Error if conflict detected and uxTracker is null (strict mode)
 */
export async function assertNoToastConflict(
  page: Page,
  context: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  // Wait briefly for toasts to appear
  await sleep(500);

  const state = await checkToastState(page);

  if (state.successCount > 0 && state.errorCount > 0) {
    const message = `Toast conflict in ${context}: ${state.successCount} success and ${state.errorCount} error toasts visible simultaneously`;
    console.log(`  CONFLICT: ${message}`);

    if (uxTracker) {
      uxTracker.log('critical', 'functional', message);
    }

    // Return false to indicate test should fail
    return false;
  }

  if (state.errorCount > 0) {
    // Only error toasts visible - this is a real error
    console.log(`  ERROR TOAST: ${state.errorCount} error toast(s) visible in ${context}`);

    // Try to get error text for debugging
    const errorToast = page.locator('[data-sonner-toast][data-type="error"], [data-radix-toast-viewport] .destructive').first();
    if (await errorToast.isVisible({ timeout: 100 }).catch(() => false)) {
      const errorText = await errorToast.textContent();
      console.log(`  Error content: ${errorText}`);
      if (uxTracker) {
        uxTracker.log('critical', 'functional', `Error toast in ${context}: ${errorText}`);
      }
    }
    return false;
  }

  if (state.successCount > 0) {
    console.log(`  ✓ Success toast visible (${state.successCount} toast(s))`);
  }

  return true;
}

/**
 * Wait for tree data to be loaded in the sidebar.
 * The sidebar shows either tree-node elements (when nodes exist) or
 * "No nodes yet" (empty state). Either indicates the tree data has loaded.
 * This is more reliable than waitForWorkspaceLoaded() for operations
 * that depend on state.treeSchema being populated.
 */
export async function waitForTreeDataLoaded(page: Page, timeout = 30000): Promise<boolean> {
  console.log('  Waiting for tree data to load...');
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const treeNode = page.locator(
      '[data-testid^="tree-node-"]:not([data-testid^="tree-node-menu-"]):not([data-testid^="tree-node-toggle-"])'
    );
    const emptyState = page.locator('text=No nodes yet');

    if (await treeNode.first().isVisible({ timeout: 500 }).catch(() => false)) {
      console.log('  Tree data loaded (nodes visible)');
      return true;
    }
    if (await emptyState.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log('  Tree data loaded (empty state)');
      return true;
    }

    await sleep(500);
  }

  console.log('  Tree data loading timeout');
  return false;
}

/**
 * Wait for and dismiss all visible toasts
 */
export async function dismissAllToasts(page: Page, timeout = 5000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const state = await checkToastState(page);
    if (state.totalCount === 0) {
      return;
    }

    // Try clicking dismiss buttons
    const dismissBtn = page.locator('[data-sonner-toast] button[data-dismiss], [data-radix-toast-viewport] button[aria-label*="close"]').first();
    if (await dismissBtn.isVisible({ timeout: 100 }).catch(() => false)) {
      await dismissBtn.click();
    }

    await sleep(500);
  }
}
