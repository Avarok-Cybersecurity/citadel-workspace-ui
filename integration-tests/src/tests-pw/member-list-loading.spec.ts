/**
 * The member list must not claim a workspace is empty while it is still loading.
 *
 * `WorkspaceService.listMembers()` only SENDS the request — the members arrive
 * later on a `members:loaded` event — but the sidebar cleared its loading flag
 * in a `finally` attached to that send. For the whole gap between request and
 * response it rendered the definitive empty state: "No members yet. Use the +
 * button to discover peers", about a workspace that had members and was merely
 * fetching them. That is KNOWN_ISSUES #6, which had stood as "needs
 * re-verification".
 *
 * The admin panel's own members tab already did this correctly — it clears
 * loading in the event handler — so the right implementation existed in the
 * codebase and the sidebar simply never got it.
 *
 * Asserting the END state would not catch this: the list is correct a moment
 * later. This samples continuously across the load and fails if the empty state
 * is ever shown, which is the only way a transient wrong answer is visible to a
 * test.
 */
import { expect } from '@playwright/test';
import { adminMemberTest } from '../fixtures/multi-user.fixture.js';

const EMPTY_STATE = /No members yet/i;

adminMemberTest('the sidebar never reports an empty member list while loading', async ({ admin }) => {
    adminMemberTest.setTimeout(300_000);
    const page = admin.page;

    // Switching nodes re-runs the load, which is what makes this reproducible
    // rather than dependent on catching the initial render.
    const nodes = page.locator('[data-testid^="tree-node-menu-"]');
    await expect(nodes.first(), 'the node tree should render').toBeAttached({ timeout: 60_000 });

    const emptyState = page.getByText(EMPTY_STATE);
    const memberEntry = page.getByText(admin.username, { exact: false });

    let sawEmptyState = false;
    let sawMembers = false;

    // Click a different node to trigger a reload, then watch the whole window
    // between request and response.
    const targets = page.locator('[data-testid^="tree-node-"]:not([data-testid^="tree-node-menu-"])');
    if (await targets.count() > 1) {
        await targets.nth(1).click({ force: true });
    }

    for (let i = 0; i < 100; i++) {
        if (await emptyState.isVisible().catch(() => false)) sawEmptyState = true;
        if (await memberEntry.first().isVisible().catch(() => false)) {
            sawMembers = true;
            break;
        }
        await page.waitForTimeout(100);
    }

    expect(
        sawMembers,
        `the member list never showed ${admin.username}; the workspace has at least this one member`,
    ).toBe(true);
    expect(
        sawEmptyState,
        'the sidebar said "No members yet" while the member list was still loading — ' +
        'the loading flag is being cleared when the request is sent rather than when it is answered',
    ).toBe(false);
});
