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
    nodeGoneFromUI,
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

        // Fail here, loudly, if this account is not an admin.
        //
        // Creating a node needs EditTreeStructure, which only the workspace
        // initialiser gets. If a workspace already exists on the server — a
        // previous run, or another spec that got there first — registration
        // silently produces an ordinary member instead, and the first symptom is
        // an office that "did not appear in the sidebar" several assertions later.
        //
        // Checked via the ADMIN SETTINGS section, which is the permission itself.
        // The add-node button is NOT a proxy: it is enabled for every user once
        // the tree schema loads, and only the server rejects the write.
        const isAdmin = await page
            .locator('text="ADMIN SETTINGS"')
            .first()
            .waitFor({ state: 'visible', timeout: 15_000 })
            .then(() => true)
            .catch(() => false);
        expect(
            isAdmin,
            'This spec needs an admin account. The workspace server already had a ' +
            'workspace, so registration produced a non-admin member and node creation ' +
            'will be denied with "Permission denied: EditTreeStructure required". ' +
            'Reset the stack with `docker compose down && docker compose up -d`.'
        ).toBe(true);
    });

    test.afterAll(async () => {
        await browser.close();
    });

    test('Create an office', async () => {
        const created = await createOfficeViaUI(page, OFFICE_NAME);
        // .success, not the object: createOfficeViaUI returns { success, name },
        // and an object is always truthy — so `expect(created).toBeTruthy()`
        // passed even when creation had failed, which is why this spec's real
        // failure only surfaced one assertion later.
        expect(created.success).toBe(true);

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
        // Signature is (page, name, description, parentName). Without parentName the
        // helper falls back to the FIRST node in the sidebar — the workspace root —
        // and creates the room there instead of inside the office under test.
        const created = await createRoomViaUI(page, ROOM_NAME, '', OFFICE_NAME);
        expect(created).toBeTruthy();

        const exists = await nodeExistsInUI(page, ROOM_NAME);
        expect(exists).toBe(true);
    });

    test('Delete the room', async () => {
        // .success, not the object: deleteNodeViaUI returns { success, cascaded },
        // and comparing an object to `true` can never pass.
        const deleted = await deleteNodeViaUI(page, ROOM_NAME);
        expect(deleted.success).toBe(true);

        // Wait for it to be gone rather than polling "does it exist" and expecting
        // false, which spends the whole appearance timeout waiting for something
        // that will never appear.
        expect(await nodeGoneFromUI(page, ROOM_NAME)).toBe(true);
    });

    test('Delete the office', async () => {
        const deleted = await deleteNodeViaUI(page, OFFICE_NAME);
        expect(deleted.success).toBe(true);
        expect(await nodeGoneFromUI(page, OFFICE_NAME)).toBe(true);
    });
});
