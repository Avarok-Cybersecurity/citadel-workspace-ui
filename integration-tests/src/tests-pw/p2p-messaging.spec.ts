/**
 * P2P Messaging — Playwright Test spec
 *
 * Tests bidirectional peer-to-peer messaging between two users.
 * Uses separate browser instances to avoid tab throttling.
 */

import { test, expect } from '@playwright/test';
import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';
import {
    clearBrowserStorage,
    waitForAppReady,
    createAccount,
    waitForWorkspaceLoaded,
    closeAnyModals,
    p2pRegister,
    acceptP2PRequest,
    openConversation,
    waitForP2PChannelReady,
    sendMessage,
    verifyMessageReceived,
    sleep,
} from '../lib/index.js';
import { config, isCI } from '../lib/config.js';

/* ── Shared state ── */

interface UserSession {
    browser: Browser;
    context: BrowserContext;
    page: Page;
    username: string;
}

const timestamp = Date.now();
const USERS = {
    a: { username: `pw_p2p_a_${timestamp}`, password: config.DEFAULT_PASSWORD },
    b: { username: `pw_p2p_b_${timestamp}`, password: config.DEFAULT_PASSWORD },
};

let sessionA: UserSession;
let sessionB: UserSession;

/* ── Helpers ── */

const LAUNCH_ARGS = [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-ipc-flooding-protection',
    ...(isCI ? [
        '--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox',
        '--disable-gpu', '--disable-extensions', '--disable-software-rasterizer',
    ] : []),
];

async function createSession(label: 'a' | 'b', isFirst: boolean): Promise<UserSession> {
    const browser = await chromium.launch({
        headless: isCI,
        slowMo: isCI ? 0 : 50,
        args: LAUNCH_ARGS,
    });
    const context = await browser.newContext({ storageState: undefined });
    await context.clearCookies();
    const page = await context.newPage();

    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
    await clearBrowserStorage(page);
    await waitForAppReady(page, 60_000);

    const user = USERS[label];
    const registered = await createAccount(page, user.username, {
        isFirstUser: isFirst,
        password: user.password,
        uxTracker: null,
    });

    if (!registered) {
        await browser.close();
        throw new Error(`Failed to register ${label}: ${user.username}`);
    }

    // Checked, not fired and forgotten: this returns false rather than
    // throwing, so ignoring it let a workspace that never loaded run the
    // whole block and fail later somewhere unrelated.
    expect(
      await waitForWorkspaceLoaded(page, 30_000),
      'the workspace should finish loading',
    ).toBe(true);
    await closeAnyModals(page);

    return { browser, context, page, username: user.username };
}

/* ── Test Suite (serial) ── */

test.describe.serial('P2P Messaging', () => {
    test.beforeAll(async () => {
        // Create two users in separate browsers
        sessionA = await createSession('a', true);
        sessionB = await createSession('b', false);
    });

    test.afterAll(async () => {
        await sessionA?.browser.close();
        await sessionB?.browser.close();
    });

    test('P2P registration and handshake', async () => {
        // User A discovers and registers with User B
        await p2pRegister(sessionA.page, sessionA.username, sessionB.username);

        // User B accepts the request
        await acceptP2PRequest(sessionB.page, sessionB.username);

        // Wait for P2P channel to be fully ready (bidirectional)
        await waitForP2PChannelReady(sessionA.page, sessionA.username, sessionB.username);
        await waitForP2PChannelReady(sessionB.page, sessionB.username, sessionA.username);
    });

    test('Open conversations on both sides', async () => {
        await openConversation(sessionA.page, sessionA.username, sessionB.username);
        await openConversation(sessionB.page, sessionB.username, sessionA.username);
    });

    // A chat transcript has to be a live region or an arriving message is
    // silent: a screen reader user only learns about it by going to look. axe
    // reports nothing — a live region is not required markup, it is a decision
    // that had not been made. Asserted where a conversation is actually open,
    // because that is the only place the transcript exists.
    test('the transcript is announced as it grows', async () => {
        const log = sessionA.page.getByRole('log', { name: /conversation/i });
        await expect(log).toBeAttached();

        // role="log" implies polite announcement of additions; an assertive
        // region here would interrupt the user mid-sentence on every message.
        const live = await log.first().getAttribute('aria-live');
        expect(live === null || live === 'polite', `aria-live was "${live}"`).toBe(true);
    });

    test('Send message A → B', async () => {
        const message = `Hello from A! [${Date.now()}]`;
        await sendMessage(sessionA.page, sessionA.username, message);
        await sleep(2000);

        const received = await verifyMessageReceived(sessionB.page, sessionB.username, message);
        expect(received).toBe(true);
    });

    test('Send message B → A', async () => {
        const message = `Hello from B! [${Date.now()}]`;
        await sendMessage(sessionB.page, sessionB.username, message);
        await sleep(2000);

        const received = await verifyMessageReceived(sessionA.page, sessionA.username, message);
        expect(received).toBe(true);
    });

    test('Rapid bidirectional exchange', async () => {
        const messagesA: string[] = [];
        const messagesB: string[] = [];

        // Send 3 messages from each side
        for (let i = 0; i < 3; i++) {
            const msgA = `Rapid A→B #${i} [${Date.now()}]`;
            const msgB = `Rapid B→A #${i} [${Date.now()}]`;
            messagesA.push(msgA);
            messagesB.push(msgB);

            await sendMessage(sessionA.page, sessionA.username, msgA);
            await sleep(500);
            await sendMessage(sessionB.page, sessionB.username, msgB);
            await sleep(500);
        }

        // Verify all messages were received
        await sleep(3000);

        for (const msg of messagesA) {
            const received = await verifyMessageReceived(sessionB.page, sessionB.username, msg);
            expect(received).toBe(true);
        }

        for (const msg of messagesB) {
            const received = await verifyMessageReceived(sessionA.page, sessionA.username, msg);
            expect(received).toBe(true);
        }
    });
});
