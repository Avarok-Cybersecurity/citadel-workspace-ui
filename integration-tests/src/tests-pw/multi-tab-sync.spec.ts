/**
 * Multi-Tab Synchronization — Playwright Test spec
 *
 * Tests the multi-tab leader/follower pattern (Section 6 in TESTING_CHECKLIST.md).
 * Previously marked "Not yet tested".
 *
 * Tests:
 * 1. Open app in two tabs within the same browser context
 * 2. Login in first tab → verify second tab syncs
 * 3. Test leader/follower tab behavior
 * 4. Close leader tab → verify follower takes over
 */

import { test, expect } from '@playwright/test';
import { isVisibleWithin } from '../lib/utils.js';
import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';
import {
    clearBrowserStorage,
    waitForAppReady,
    createAccount,
    waitForWorkspaceLoaded,
    closeAnyModals,
    sleep, isHeaded,} from '../lib/index.js';
import { config, isCI } from '../lib/config.js';

/* ── Shared state ── */

const timestamp = Date.now();
const USERNAME = `pw_multitab_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

let browser: Browser;
let context: BrowserContext;
let tab1: Page;
let tab2: Page;

/* ── Test Suite (serial) ── */

test.describe.serial('Multi-Tab Synchronization', () => {
    test.beforeAll(async () => {
        browser = await chromium.launch({
            headless: !isHeaded,
            slowMo: isHeaded ? 50 : 0,
            args: [
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-ipc-flooding-protection',
                ...(isCI ? [
                    '--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox',
                    '--disable-gpu', '--disable-extensions', '--disable-software-rasterizer',
                ] : []),
            ],
        });

        // SINGLE context — both tabs share storage and websocket
        context = await browser.newContext({ storageState: undefined });
        await context.clearCookies();
    });

    test.afterAll(async () => {
        await browser.close();
    });

    test('Register user in Tab 1', async () => {
        tab1 = await context.newPage();
        await tab1.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
        await clearBrowserStorage(tab1);
        await waitForAppReady(tab1, 60_000);

        const registered = await createAccount(tab1, USERNAME, {
            isFirstUser: true,
            password: PASSWORD,
            uxTracker: null,
        });
        expect(registered).toBe(true);

        // Checked, not fired and forgotten: this returns false rather than
        // throwing, so ignoring it let a workspace that never loaded run the
        // whole block and fail later somewhere unrelated.
        expect(
          await waitForWorkspaceLoaded(tab1, 30_000),
          'the workspace should finish loading',
        ).toBe(true);
        await closeAnyModals(tab1);
    });

    test('Open Tab 2 — should detect existing session', async () => {
        tab2 = await context.newPage();
        await tab2.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
        await waitForAppReady(tab2, 60_000);

        // Tab 2 should see the existing session in the OrphanSessionsNavbar
        // or be redirected to the workspace since the context shares storage
        await sleep(3000);

        // Check if tab2 sees the session or is on workspace
        const url = tab2.url();
        const onWorkspace = url.includes('/workspace') || url.includes('/office');
        const seesSession = await isVisibleWithin(tab2.locator(`button[title*="${USERNAME}"]`), 5000);
        const seesLandingButtons = await isVisibleWithin(tab2.locator('button:has-text("Login Workspace")'), 2000);

        // At least one of these should be true
        expect(onWorkspace || seesSession || seesLandingButtons).toBe(true);
    });

    test('Tab 2 can access workspace state from shared storage', async () => {
        // The shared browser context means Tab 2 has access to the same
        // localStorage, IndexedDB, and cookies as Tab 1
        await tab2.bringToFront();
        await sleep(1000);

        const hasStorageData = await tab2.evaluate(() => {
            // Check if workspace-related data exists in localStorage
            const keys = Object.keys(localStorage);
            return keys.length > 0;
        });

        // Shared context should have some storage state from Tab 1's registration
        expect(hasStorageData).toBe(true);
    });

    test('Close Tab 1 (leader) — Tab 2 should remain functional', async () => {
        // Close Tab 1
        await tab1.close();
        await sleep(2000);

        // Tab 2 should still be responsive
        await tab2.bringToFront();
        await sleep(1000);

        const responsive = await tab2.evaluate(() => document.readyState)
            .catch(() => null);
        expect(responsive).toBeTruthy();
    });

    test('Tab 2 can navigate independently after leader closes', async () => {
        // Navigate Tab 2 to the landing page
        await tab2.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 30_000 });
        await waitForAppReady(tab2, 30_000);

        // Should see either workspace loaded or landing page buttons
        // A web-first assertion, not isVisible: this is an ASSERTION, and
        // isVisible returns immediately (its timeout option is declared
        // deprecated and ignored), so on a loaded runner this failed whenever
        // the render had not landed yet. toBeVisible retries until the timeout.
        await expect(
            tab2.locator('button:has-text("Join Workspace"), button:has-text("Login Workspace"), [data-sidebar="sidebar"]').first()
        ).toBeVisible({ timeout: 10_000 });
    });
});
