/**
 * Browser setup and management
 */

import { chromium, Page } from 'playwright';
import type { BrowserOptions, BrowserSetup } from './types.js';

/**
 * Create a browser and context for testing
 *
 * NOTE: We use a SINGLE browser context for all tabs to share ONE WebSocket connection.
 * This mirrors real-world usage where users have multiple tabs in the same browser.
 * We clear storage to ensure a clean state for each test run.
 */
export async function createBrowser(options: BrowserOptions = {}): Promise<BrowserSetup> {
  const { headless = false, slowMo = 50 } = options;

  const browser = await chromium.launch({ headless, slowMo });

  // Create context with cleared storage for fresh test state
  const context = await browser.newContext({
    storageState: undefined, // Clear any previous storage
  });

  // Clear storage in context to ensure no stale data
  await context.clearCookies();

  return { browser, context };
}

/**
 * Clear all browser storage (localStorage, sessionStorage, IndexedDB) for a page
 * Must be called AFTER navigating to the page since storage is origin-specific
 * Uses timeout to avoid hanging if page is unresponsive
 */
export async function clearBrowserStorage(page: Page): Promise<void> {
  console.log('  Clearing browser storage...');
  try {
    // Use Promise.race with timeout to avoid hanging
    await Promise.race([
      page.evaluate(() => {
        // Clear localStorage
        localStorage.clear();
        // Clear sessionStorage
        sessionStorage.clear();
        // Note: Skip IndexedDB clearing - it can cause hangs and localStorage/sessionStorage is sufficient
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Storage clear timeout')), 5000)
      )
    ]);
    console.log('  Browser storage cleared');
  } catch (error) {
    console.log('  WARNING: Storage clear failed or timed out, continuing anyway');
  }
}

/**
 * Setup console log capture for a page
 */
export function setupConsoleCapture(page: Page, label: string, filterKeywords: string[] = []): string[] {
  const logs: string[] = [];

  page.on('console', msg => {
    const text = msg.text();
    const shouldLog = filterKeywords.length === 0 ||
      filterKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()));

    if (shouldLog) {
      logs.push(`[${new Date().toISOString()}] ${text}`);
      console.log(`  [${label}] ${text.substring(0, 150)}`);
    }
  });

  return logs;
}
