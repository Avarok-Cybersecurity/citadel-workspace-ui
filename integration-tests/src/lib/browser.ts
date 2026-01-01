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

  const browser = await chromium.launch({
    headless,
    slowMo,
    args: [
      // Prevent background tab throttling - critical for multi-tab tests
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      // Prevent tab throttling based on visibility
      '--disable-ipc-flooding-protection',
    ],
  });

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
 * Wake up a backgrounded tab and ensure it's responsive
 *
 * Chrome throttles background tabs even with anti-throttling flags.
 * This function brings the tab to front and waits until it's responsive
 * by verifying a simple DOM operation succeeds.
 *
 * @param page - Playwright page
 * @param label - Label for logging (e.g., username)
 * @param maxWaitMs - Maximum time to wait for responsiveness (default 5000ms)
 * @returns true if tab is responsive, false if it timed out
 */
export async function wakeUpTab(page: Page, label: string, maxWaitMs = 5000): Promise<boolean> {
  console.log(`  [${label}] Waking up tab...`);

  // Bring tab to front
  await page.bringToFront();

  const startTime = Date.now();
  let attempts = 0;

  // Keep trying until the tab responds or we timeout
  while (Date.now() - startTime < maxWaitMs) {
    attempts++;
    try {
      // Try a simple DOM operation with a short timeout
      // If the tab is frozen, this will timeout
      const result = await Promise.race([
        page.evaluate(() => {
          // Simple DOM read to verify responsiveness
          return document.readyState;
        }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Tab unresponsive')), 500)
        )
      ]);

      if (result) {
        console.log(`  [${label}] Tab responsive after ${Date.now() - startTime}ms (${attempts} attempts)`);
        // Give it a bit more time for any pending async operations
        await new Promise(resolve => setTimeout(resolve, 100));
        return true;
      }
    } catch {
      // Tab not responsive yet, wait and retry
      console.log(`  [${label}] Tab not responsive (attempt ${attempts}), waiting...`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log(`  [${label}] WARNING: Tab still unresponsive after ${maxWaitMs}ms`);
  return false;
}

/**
 * Attempt to recover an unresponsive tab by reloading the page
 *
 * When the WASM client enters a blocking state (likely waiting on WebSocket),
 * the JavaScript event loop becomes unresponsive. The only way to recover is
 * to reload the page, which resets the WASM client state.
 *
 * After recovery:
 * - User will need to reconnect (workspace will reload from scratch)
 * - P2P connections will need to be re-established
 * - Any unsent messages may be lost
 *
 * @param page - Playwright page to recover
 * @param label - Label for logging
 * @param baseUrl - URL to navigate to after reload (e.g., 'http://localhost:5173/')
 * @returns true if recovery was successful, false otherwise
 */
export async function recoverUnresponsiveTab(
  page: Page,
  label: string,
  baseUrl: string = 'http://localhost:5173/'
): Promise<boolean> {
  console.log(`  [${label}] Attempting to recover unresponsive tab...`);

  try {
    // Try to forcefully reload using Playwright's page methods
    // These work at the browser level, not through JavaScript execution
    console.log(`  [${label}] Forcing page reload...`);

    // Use goto with a new navigation - this bypasses the unresponsive JavaScript
    // and forces Chrome to kill the current page and navigate fresh
    await page.goto(baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log(`  [${label}] Page reloaded, waiting for responsiveness...`);

    // Wait a moment for the page to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify the page is now responsive
    const responsive = await wakeUpTab(page, label, 10000);

    if (responsive) {
      console.log(`  [${label}] Tab recovered successfully!`);
      return true;
    } else {
      console.log(`  [${label}] Tab still unresponsive after reload`);
      return false;
    }
  } catch (error) {
    console.log(`  [${label}] Recovery failed: ${error}`);
    return false;
  }
}

/**
 * Wake up tab with automatic recovery if unresponsive
 *
 * Enhanced version of wakeUpTab that attempts to recover if the initial
 * wake-up fails. Use this for critical operations where responsiveness
 * is required.
 *
 * @param page - Playwright page
 * @param label - Label for logging (e.g., username)
 * @param baseUrl - URL for recovery navigation
 * @param maxWaitMs - Maximum time to wait for responsiveness (default 5000ms)
 * @param attemptRecovery - Whether to attempt recovery if unresponsive (default true)
 * @returns true if tab is responsive (possibly after recovery), false if unrecoverable
 */
export async function wakeUpTabWithRecovery(
  page: Page,
  label: string,
  baseUrl: string = 'http://localhost:5173/',
  maxWaitMs = 5000,
  attemptRecovery = true
): Promise<boolean> {
  // First try normal wake-up
  const responsive = await wakeUpTab(page, label, maxWaitMs);

  if (responsive) {
    return true;
  }

  if (!attemptRecovery) {
    return false;
  }

  // Tab is unresponsive - attempt recovery
  console.log(`  [${label}] Tab unresponsive, attempting recovery...`);
  return await recoverUnresponsiveTab(page, label, baseUrl);
}

/**
 * Create multiple isolated browser contexts for multi-user testing
 *
 * Each user gets their own browser context (effectively their own browser window),
 * which prevents tab freezing issues caused by Chrome throttling backgrounded tabs.
 * All contexts still connect to the same backend, so P2P messaging works.
 *
 * @param browser - Playwright browser instance
 * @param count - Number of contexts to create
 * @returns Array of browser contexts
 */
export async function createIsolatedContexts(
  browser: import('playwright').Browser,
  count: number
): Promise<import('playwright').BrowserContext[]> {
  const contexts: import('playwright').BrowserContext[] = [];

  for (let i = 0; i < count; i++) {
    const context = await browser.newContext({
      storageState: undefined, // Clear any previous storage
    });
    await context.clearCookies();
    contexts.push(context);
  }

  console.log(`  Created ${count} isolated browser contexts for multi-user testing`);
  return contexts;
}

/**
 * Multi-browser setup for testing
 */
export interface MultiBrowserSetup {
  browsers: import('playwright').Browser[];
  pages: Page[];
  cleanup: () => Promise<void>;
}

/**
 * Create completely separate browser instances for multi-user testing
 *
 * Unlike createIsolatedContexts (which creates contexts within ONE browser),
 * this launches SEPARATE browser processes for each user. This completely
 * eliminates Chrome's tab throttling issues since each user has their own
 * browser process.
 *
 * Use this when isolated contexts still experience throttling/freezing.
 *
 * @param count - Number of browser instances to create
 * @param options - Browser launch options
 * @returns MultiBrowserSetup with browsers, pages, and cleanup function
 */
export async function createSeparateBrowsers(
  count: number,
  options: BrowserOptions = {}
): Promise<MultiBrowserSetup> {
  const { headless = false, slowMo = 50 } = options;

  const browsers: import('playwright').Browser[] = [];
  const pages: Page[] = [];

  for (let i = 0; i < count; i++) {
    const browser = await chromium.launch({
      headless,
      slowMo,
      args: [
        // Prevent background tab throttling
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-ipc-flooding-protection',
      ],
    });

    const context = await browser.newContext({
      storageState: undefined,
    });
    await context.clearCookies();

    const page = await context.newPage();
    browsers.push(browser);
    pages.push(page);
  }

  console.log(`  Created ${count} SEPARATE browser instances for multi-user testing`);

  const cleanup = async () => {
    for (const browser of browsers) {
      try {
        await browser.close();
      } catch (e) {
        console.log(`  Warning: Browser close failed: ${e}`);
      }
    }
  };

  return { browsers, pages, cleanup };
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
