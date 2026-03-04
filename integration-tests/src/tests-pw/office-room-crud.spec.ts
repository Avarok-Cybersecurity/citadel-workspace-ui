/**
 * Office & Room CRUD — Playwright Test spec
 *
 * Tests workspace structure management: create, read, update, delete
 * for offices and rooms.
 */

import { test, expect } from '@playwright/test';
import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';
import {
    clearBrowserStorage,
    waitForAppReady,
    createAccount,
    waitForWorkspaceLoaded,
    closeAnyModals,
    createOfficeViaUI,
    createRoomViaUI,
    deleteNodeViaUI,
    nodeExistsInUI,
    navigateToOfficeViaUI,
    sleep,
} from '../lib/index.js';
import { config, isCI } from '../lib/config.js';

/* ── Shared state ── */

const timestamp = Date.now();
const USERNAME = `pw_crud_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

let browser: Browser;
let context: BrowserContext;
let page: Page;

const OFFICE_NAME = `Test Office ${timestamp}`;
const ROOM_NAME = `Test Room ${timestamp}`;

/* ── Test Suite (serial) ── */

test.describe.serial('Office & Room CRUD', () => {
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
        page = await context.newPage();

        // Register and authenticate
        await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
        await clearBrowserStorage(page);
        await waitForAppReady(page, 60_000);

        const registered = await createAccount(page, USERNAME, {
            isFirstUser: true,
            password: PASSWORD,
            uxTracker: null,
        });
        expect(registered).toBe(true);

        await waitForWorkspaceLoaded(page, 30_000);
        await closeAnyModals(page);
    });

    test.afterAll(async () => {
        await browser.close();
    });

    test('Create an office', async () => {
        const created = await createOfficeViaUI(page, OFFICE_NAME);
        expect(created).toBeTruthy();

        // Verify it appears in the sidebar
        const exists = await nodeExistsInUI(page, OFFICE_NAME);
        expect(exists).toBe(true);
    });

    test('Navigate to the office', async () => {
        await navigateToOfficeViaUI(page, OFFICE_NAME);
        await sleep(1000);

        // Verify we're viewing the office content area
        const url = page.url();
        expect(url).toContain('/workspace');
    });

    test('Create a room inside the office', async () => {
        const created = await createRoomViaUI(page, ROOM_NAME);
        expect(created).toBeTruthy();

        const exists = await nodeExistsInUI(page, ROOM_NAME);
        expect(exists).toBe(true);
    });

    test('Delete the room', async () => {
        const deleted = await deleteNodeViaUI(page, ROOM_NAME);
        expect(deleted).toBe(true);

        await sleep(1000);
        const exists = await nodeExistsInUI(page, ROOM_NAME);
        expect(exists).toBe(false);
    });

    test('Delete the office', async () => {
        const deleted = await deleteNodeViaUI(page, OFFICE_NAME);
        expect(deleted).toBe(true);

        await sleep(1000);
        const exists = await nodeExistsInUI(page, OFFICE_NAME);
        expect(exists).toBe(false);
    });
});
