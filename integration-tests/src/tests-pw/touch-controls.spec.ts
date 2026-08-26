/**
 * Row actions have to be operable on a touch device.
 *
 * Eight controls were written as `opacity-0 group-hover:opacity-100`. On a
 * phone there is no hover, so the reveal never fires and the control is not
 * hard to find but unreachable — that took Edit, Admin Settings and Delete off
 * the node tree, and reply/edit/delete off every message, for anyone using the
 * installed PWA.
 *
 * Nothing caught it because every check ran a desktop browser with a mouse.
 * axe saw an element that was present and labelled; the tap-target and overflow
 * scans measured geometry, and the geometry was fine — the element was laid
 * out, merely transparent. Even the 375px screenshots were captured by a
 * browser reporting `hover: hover`, so they showed desktop behaviour at phone
 * width. Resizing a window does not make a phone.
 *
 * So this emulates touch properly and asserts the control can actually be
 * operated, rather than photographing it.
 */
import { test, expect } from '@playwright/test';
import {
    clearBrowserStorage,
    waitForAppReady,
    createAccount,
    waitForWorkspaceLoaded,
    closeAnyModals,
    config,
} from '../lib/index.js';

test('node actions are reachable on a touch device', async ({ browser }) => {
    test.setTimeout(300_000);

    const context = await browser.newContext({
        viewport: { width: 375, height: 667 },
        hasTouch: true,
        isMobile: true,
    });
    const page = await context.newPage();

    try {
        await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
        await clearBrowserStorage(page);
        await page.reload({ waitUntil: 'commit', timeout: 60_000 });
        await waitForAppReady(page, 60_000);

        // The premise, asserted rather than assumed. Without touch emulation
        // Chromium reports `hover: hover` even in a 375px window, the fade-out
        // applies exactly as it does on a desktop, and this spec would pass
        // while proving nothing about a phone.
        const pointer = await page.evaluate(() => ({
            hover: window.matchMedia('(hover: hover)').matches,
            fine: window.matchMedia('(pointer: fine)').matches,
        }));
        expect(
            pointer,
            'the context is not emulating touch, so this spec cannot test what it claims to',
        ).toEqual({ hover: false, fine: false });

        const user = `touch_${Date.now()}`;
        expect(
            await createAccount(page, user, { isFirstUser: true, password: config.DEFAULT_PASSWORD }),
            'account creation should succeed',
        ).toBe(true);
        expect(await waitForWorkspaceLoaded(page, 90_000), 'the workspace should load').toBe(true);
        await closeAnyModals(page);

        // At phone width the sidebar is collapsed behind the hamburger, which is
        // correct: the tree is not on screen until it is opened. Tapping it is
        // part of the journey being tested, not a workaround for it.
        const sidebarToggle = page.getByTestId('sidebar-toggle');
        await expect(sidebarToggle, 'the sidebar toggle should be present at phone width').toBeVisible({
            timeout: 30_000,
        });
        await sidebarToggle.tap();

        const trigger = page.locator('[data-testid^="tree-node-menu-"]').first();
        await expect(trigger, 'the node tree should render once the sidebar is open').toBeAttached({
            timeout: 60_000,
        });

        // Opacity, not visibility: Playwright treats a fully transparent element
        // as visible, so `toBeVisible()` passed against the broken code. This is
        // the property that actually decided whether a user could see it.
        const opacity = await trigger.evaluate((el) => getComputedStyle(el).opacity);
        expect(
            Number(opacity),
            'the node actions button is transparent on a touch device — it is revealed by hover, which a phone does not have',
        ).toBeGreaterThan(0);

        // And it works when tapped, without the force: true that would paper
        // over an element nothing can reach.
        await trigger.tap();
        await expect(
            page.locator('[role="menu"]'),
            'tapping the node actions button should open its menu',
        ).toBeVisible({ timeout: 10_000 });
    } finally {
        await context.close();
    }
});
