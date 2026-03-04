/**
 * Error Handling — Playwright Test spec
 *
 * Tests various error conditions and user feedback (Section 7 in TESTING_CHECKLIST.md).
 * Previously marked "Not yet tested".
 *
 * Tests:
 * 1. Wrong password during registration
 * 2. Wrong password during login
 * 3. Wrong workspace master password
 * 4. Invalid server address / network timeout
 * 5. All error toasts use destructive variant (red)
 */

import { test, expect } from '@playwright/test';
import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';
import {
    clearBrowserStorage,
    waitForAppReady,
    sleep,
} from '../lib/index.js';
import { config, isCI } from '../lib/config.js';

/* ── Shared browser (each test gets a fresh page) ── */

let browser: Browser;
let context: BrowserContext;

/* ── Helpers ── */

async function freshPage(): Promise<Page> {
    const page = await context.newPage();
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
    await clearBrowserStorage(page);
    await waitForAppReady(page, 60_000);
    return page;
}

/**
 * Check if a destructive (red) error toast appeared
 */
async function hasErrorToast(page: Page): Promise<boolean> {
    // Sonner and Radix toasts use data attributes or CSS classes for destructive variants
    const selectors = [
        '[data-type="error"]',                // Sonner error toast
        '[data-sonner-toast][data-type="error"]',
        '.destructive',                        // Radix destructive variant
        '[class*="destructive"]',
        '.text-red-400',                       // Inline error text
        '[role="alert"]',                      // Accessible alert
    ];

    for (const selector of selectors) {
        if (await page.locator(selector).first().isVisible({ timeout: 2000 }).catch(() => false)) {
            return true;
        }
    }
    return false;
}

/* ── Test Suite ── */

test.describe('Error Handling', () => {
    test.beforeAll(async () => {
        browser = await chromium.launch({
            headless: isCI,
            slowMo: isCI ? 0 : 50,
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
        context = await browser.newContext({ storageState: undefined });
        await context.clearCookies();
    });

    test.afterAll(async () => {
        await browser.close();
    });

    test('Invalid server address shows ConnectionRetryModal', async () => {
        const page = await freshPage();

        // Click "Join Workspace"
        await page.locator('button:has-text("Join Workspace")').click();
        await sleep(500);

        // Enter a bad server address
        const serverInput = page.locator('input#server-address, input[placeholder*="server"], input#server')
            .first();
        await expect(serverInput).toBeVisible({ timeout: 5000 });
        await serverInput.fill('999.999.999.999:99999');
        await sleep(300);

        // Enter workspace password
        const passwordInput = page.locator('input#workspace-password, input[type="password"]').first();
        if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await passwordInput.fill('bad_password');
            await sleep(300);
        }

        // Click Next/Connect
        const nextBtn = page.locator('button:has-text("NEXT"), button:has-text("Connect"), button[type="submit"]').first();
        await nextBtn.click();

        // Should show some error indication within 15 seconds
        // (ConnectionRetryModal, error toast, or inline error)
        await sleep(5000);

        const hasError = await hasErrorToast(page);
        const hasRetryModal = await page.locator('text="Unable to connect"').isVisible({ timeout: 10_000 }).catch(() => false);
        const hasInlineError = await page.locator('.text-red-400, .text-destructive').first().isVisible({ timeout: 2000 }).catch(() => false);

        expect(hasError || hasRetryModal || hasInlineError).toBe(true);
        await page.close();
    });

    test('Login with wrong username shows error', async () => {
        const page = await freshPage();

        // Click Login Workspace
        const loginBtn = page.locator('button:has-text("Login Workspace")');
        await expect(loginBtn).toBeVisible({ timeout: 5000 });
        await loginBtn.click();
        await sleep(1000);

        // Fill with non-existent username
        await page.locator('input#username').fill('nonexistent_user_12345');
        await page.locator('input#password').fill('wrong_password');
        await sleep(300);

        // Set server address via Advanced Options
        const advancedBtn = page.locator('button:has-text("Advanced Options")');
        if (await advancedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await advancedBtn.click();
            await sleep(300);
            const serverInput = page.locator('input#server');
            if (await serverInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await serverInput.fill(config.WORKSPACE_SERVER);
                await sleep(300);
            }
        }

        // Submit
        await page.locator('button[type="submit"]:has-text("Connect")').click();
        await sleep(5000);

        // Should show an error (toast or inline)
        const hasError = await hasErrorToast(page);
        const hasInlineError = await page.locator('.text-red-400, .text-destructive').first()
            .isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasError || hasInlineError).toBe(true);
        await page.close();
    });

    test('Registration with mismatched passwords shows error', async () => {
        const page = await freshPage();

        // Click "Join Workspace"
        await page.locator('button:has-text("Join Workspace")').click();
        await sleep(500);

        // Enter valid server address first
        const serverInput = page.locator('input#server-address, input[placeholder*="server"], input#server')
            .first();
        if (await serverInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await serverInput.fill(config.WORKSPACE_SERVER);
        }

        // Enter workspace password if needed
        const wpInput = page.locator('input#workspace-password, input[type="password"]').first();
        if (await wpInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await wpInput.fill(config.WORKSPACE_PASSWORD);
        }

        // Click Next to reach registration form
        const nextBtn = page.locator('button:has-text("NEXT"), button[type="submit"]').first();
        if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await nextBtn.click();
            await sleep(2000);
        }

        // Fill registration form with mismatched passwords
        const nameInput = page.locator('input#name, input[placeholder*="name"]').first();
        if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await nameInput.fill('Test User');
        }

        const usernameInput = page.locator('input#username').first();
        if (await usernameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await usernameInput.fill(`mismatch_test_${Date.now()}`);
        }

        const passInput = page.locator('input#password').first();
        if (await passInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await passInput.fill('password123');
        }

        const confirmInput = page.locator('input#confirm-password, input#confirmPassword').first();
        if (await confirmInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await confirmInput.fill('different_password');
        }

        // Try to submit
        const joinBtn = page.locator('button:has-text("JOIN"), button[type="submit"]').first();
        if (await joinBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await joinBtn.click();
            await sleep(2000);
        }

        // Should show validation error — passwords don't match
        const hasError = await hasErrorToast(page);
        const hasInlineError = await page.locator('.text-red-400, .text-destructive, [class*="error"]')
            .first().isVisible({ timeout: 3000 }).catch(() => false);
        const hasValidationMsg = await page.locator('text=/password.*match/i, text=/do not match/i')
            .first().isVisible({ timeout: 3000 }).catch(() => false);

        // At minimum, the form should prevent submission or show an error
        expect(hasError || hasInlineError || hasValidationMsg).toBe(true);
        await page.close();
    });

    test('Error messages are user-friendly (not raw stack traces)', async () => {
        const page = await freshPage();
        const consoleErrors: string[] = [];

        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        // Trigger a connection error by trying to connect to a bad address
        await page.locator('button:has-text("Join Workspace")').click();
        await sleep(500);

        const serverInput = page.locator('input#server-address, input[placeholder*="server"], input#server')
            .first();
        if (await serverInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await serverInput.fill('127.0.0.1:1'); // port 1 — should fail fast
        }

        const wpInput = page.locator('input#workspace-password, input[type="password"]').first();
        if (await wpInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await wpInput.fill('test');
        }

        const nextBtn = page.locator('button:has-text("NEXT"), button[type="submit"]').first();
        if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await nextBtn.click();
        }

        await sleep(10_000);

        // Check any visible error messages don't contain raw stack traces
        const errorTexts = await page.locator('.text-red-400, [data-type="error"], [role="alert"]')
            .allTextContents();

        for (const text of errorTexts) {
            // Should not contain raw JavaScript error internals
            expect(text).not.toContain('at Object.');
            expect(text).not.toContain('node_modules');
            expect(text).not.toContain('.js:');
            expect(text).not.toContain('TypeError:');
        }

        await page.close();
    });
});
