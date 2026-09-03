/**
 * The permission matrix has to fit the phone it is shown on.
 *
 * It is the widest thing in the product — a label column plus one column per
 * role — and at 375px it rendered wider than the viewport and horizontally
 * centred, so it was clipped on BOTH sides: the entire PERMISSION column was off
 * screen to the left and Guest off screen to the right. What an administrator
 * saw was a grid of checkmarks with no way to tell which permission any row
 * belonged to, and no way to scroll to find out.
 *
 * The cause is the flex/grid `min-width: auto` default. `DialogContent` is a
 * grid whose width is `calc(100% - 2rem)`, but a grid item may not shrink below
 * its content's min-content width unless told to, so the table's ~620px forced
 * the panel past the screen edges instead of scrolling inside its own
 * `overflow-auto` container. The same default is called out in TopBar, where it
 * pushed the avatar off a 375px viewport.
 *
 * This measures geometry rather than photographing it: a screenshot shows the
 * problem to a human, a bounding box fails a build.
 */
import { expect } from '@playwright/test';
import { adminMemberTest } from '../fixtures/multi-user.fixture.js';
import { adminDialog, openAdminPanel, activateAdminTab } from '../lib/index.js';

const PHONE = { width: 375, height: 667 };

adminMemberTest('the permission matrix stays inside a 375px viewport', async ({ admin }) => {
    adminMemberTest.setTimeout(300_000);
    const page = admin.page;

    await page.setViewportSize(PHONE);
    // Settle before touching the sidebar: useIsMobile reads window.innerWidth
    // from a media-query listener, so immediately after a resize it still
    // reports desktop and the toggle collapses the desktop sidebar instead of
    // opening the mobile sheet.
    await page.waitForTimeout(1000);

    const treeNode = page.locator('[data-testid^="tree-node-menu-"]').first();
    const sidebarToggle = page.getByTestId('sidebar-toggle');
    for (let attempt = 0; attempt < 3; attempt++) {
        if (await treeNode.isVisible().catch(() => false)) break;
        await sidebarToggle.click({ force: true });
        await page.waitForTimeout(1200);
    }

    expect(await openAdminPanel(page), 'Admin Settings should open at phone width').toBe(true);
    expect(await activateAdminTab(page, 'members'), 'the Members tab should render').toBe(true);

    const dialog = adminDialog(page);

    // The row's controls before the matrix: a member row is a long username on
    // the left and the controls on the right, and without truncation the name
    // pushed the role selector and remove button straight off the screen. They
    // are the reason the row exists, so they are what must survive.
    const roleSelect = dialog.locator('[data-testid^="member-role-select-"]').first();
    const removeButton = dialog.locator('[data-testid^="member-remove-"]').first();
    await expect(roleSelect, 'the role selector should be rendered').toBeVisible({ timeout: 30_000 });
    await expect(
        roleSelect,
        'the role selector is off screen at 375px — a long username pushed it out of the row',
    ).toBeInViewport();
    await expect(
        removeButton,
        'the remove control is off screen at 375px',
    ).toBeInViewport();

    // Reachable controls acting on an unidentifiable person is not a fix. With
    // the row side by side at 375px the controls took ~180px of ~295 and the
    // name rendered as a single character plus an ellipsis, so the row stacks
    // below `sm` instead.
    //
    // Measured as scrollWidth vs clientWidth, NOT by reading the text. An
    // earlier version of this asserted innerText contained the username and
    // passed against the squeezed row: `text-overflow: ellipsis` paints an
    // ellipsis without touching the DOM, so the full string is still there to
    // read. The assertion was true of a layout no one could use — which is the
    // failure it was written to catch.
    const nameEl = dialog.locator('[data-testid^="member-row-"]').first().locator('.font-medium').first();
    const nameFit = await nameEl.evaluate((el) => ({
        scroll: el.scrollWidth,
        client: el.clientWidth,
        text: el.textContent ?? '',
    }));
    expect(
        nameFit.scroll,
        `"${nameFit.text}" is clipped to ${nameFit.client}px of ${nameFit.scroll}px — ` +
        'the member name is truncated past the point of identifying anyone',
    ).toBeLessThanOrEqual(nameFit.client + 1);

    const advanced = dialog.getByTestId('members-advanced-toggle');
    await expect(advanced, 'the advanced permissions toggle should be present').toBeVisible({
        timeout: 30_000,
    });
    await advanced.click({ force: true });

    const openMatrix = dialog.locator('[data-testid^="member-permissions-"]').first();
    await expect(openMatrix, 'the Permissions button should appear').toBeVisible({ timeout: 30_000 });
    await openMatrix.click({ force: true });

    const heading = page.getByText('Permission Manager');
    await expect(heading, 'the matrix should open').toBeVisible({ timeout: 30_000 });

    // Nothing may sit outside the screen. One pixel of tolerance for subpixel
    // rounding on the centring transform.
    const box = await dialog.boundingBox();
    expect(box, 'the dialog should have a box to measure').not.toBeNull();
    expect(
        box!.x,
        'the matrix starts off the left edge of the screen, so the permission names are unreachable',
    ).toBeGreaterThanOrEqual(-1);
    expect(
        box!.x + box!.width,
        'the matrix extends past the right edge of the screen',
    ).toBeLessThanOrEqual(PHONE.width + 1);

    // The label column is the part that was lost, so assert it specifically
    // rather than trusting the dialog's box alone.
    //
    // HORIZONTAL bounds, not toBeInViewport(). The defect was the label column
    // sitting off the left edge of the screen; where a given row falls
    // vertically is ordinary scrolling and none of this test's business. The
    // first version asserted full viewport intersection and passed locally by a
    // few pixels — the MDX row was the last one above the fold — then failed in
    // CI where font metrics put it just below. It was measuring the layout's
    // vertical luck, not the thing that broke.
    //
    // By testid, not by words. The second version looked for the literal string
    // "Edit MDX Content"; the label became "Can edit MDX documents" and this
    // found nothing for thirty seconds, every run, while the 375px guard below
    // never executed at all. The failure read as a broken test rather than as a
    // guard that had stopped guarding.
    const permissionLabel = page.getByTestId('permission-row-EditMdx').first();
    await expect(permissionLabel, 'the permission label should render').toBeAttached({
        timeout: 30_000,
    });
    await permissionLabel.scrollIntoViewIfNeeded();

    // The invariant, measured on the dialog itself: it must not scroll
    // horizontally. That is precisely what `[&>*]:min-w-0` establishes — a grid
    // item may otherwise not shrink below its content, so the table's ~620px
    // widens the panel and the whole dialog gains a horizontal scrollbar,
    // taking the label column off the left edge as soon as anything scrolls it.
    // The inner table container owns the sideways scrolling; the dialog must
    // not.
    //
    // Two earlier versions of this check measured consequences instead, and
    // both passed with the fix reverted: the label's own box is inside the
    // screen at scroll position 0 whether or not the dialog can scroll, and
    // toBeInViewport() additionally depended on which row happened to sit above
    // the fold.
    const overflow = await dialog.evaluate((el) => ({
        scroll: el.scrollWidth,
        client: el.clientWidth,
    }));
    expect(
        overflow.scroll,
        `the dialog scrolls horizontally (${overflow.scroll}px of content in ${overflow.client}px) — ` +
        'its content cannot shrink to the screen, so the permission label column ends up off the left edge',
    ).toBeLessThanOrEqual(overflow.client + 1);
});
