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

/**
 * The sidebar's empty state, addressed by TESTID.
 *
 * This was `/No members yet/i`, matched with `getByText`. The sidebar has never
 * rendered that sentence: `MembersEmptyState.tsx` says "Nobody else is here yet.
 * Invite someone with the share button above". The only "No members yet" in the
 * app is `pages/DirectoryTabContent.tsx`, a different screen this spec never
 * opens.
 *
 * So `sawEmptyState` was structurally false and `expect(sawEmptyState).toBe(false)`
 * — the one assertion this spec exists for — could not fail. The loading fix in
 * `MembersSection.tsx` could be reverted whole and this stayed green.
 *
 * A testid rather than copy, because copy is what drifted: the header above still
 * quotes the old sentence as the bug's symptom, which is exactly how a stale
 * locator survives review.
 */
const EMPTY_STATE_TESTID = 'members-empty';

adminMemberTest('the sidebar never reports an empty member list while loading', async ({ admin }) => {
    adminMemberTest.setTimeout(300_000);
    const page = admin.page;

    // Switching nodes re-runs the load, which is what makes this reproducible
    // rather than dependent on catching the initial render.
    const nodes = page.locator('[data-testid^="tree-node-menu-"]');
    await expect(nodes.first(), 'the node tree should render').toBeAttached({ timeout: 60_000 });

    // That this testid is one the app actually renders is enforced statically by
    // check-specs-search-for-real-copy.mjs, which now resolves every getByTestId
    // in a spec against src/. A runtime check here could only run once the element
    // is on screen, which is precisely the state this spec asserts never happens.
    const emptyState = page.getByTestId(EMPTY_STATE_TESTID);
    const memberEntry = page.getByText(admin.username, { exact: false });

    let sawEmptyState = false;
    let sawMembers = false;

    // Click a different node to trigger a reload, then watch the whole window
    // between request and response.
    const targets = page.locator('[data-testid^="tree-node-"]:not([data-testid^="tree-node-menu-"])');
    if (await targets.count() > 1) {
        await targets.nth(1).click({ force: true });
    }

    // What the DOM held at the moment the empty state was seen.
    //
    // Two fixes have been aimed at this spec on the strength of reading the
    // code -- initialising the loading flag from the prop, then deriving it from
    // the domain instead of storing it -- and it still fails its first attempt
    // and passes on retry. Neither reproduces locally without the compose stack,
    // so the next CI failure has to carry its own diagnosis rather than inviting
    // a third guess.
    let atFirstSighting = '';
    for (let i = 0; i < 100; i++) {
        if (await emptyState.isVisible().catch(() => false)) {
            if (!sawEmptyState) {
                atFirstSighting = await page.evaluate(() => {
                    const text = (sel: string): string =>
                        document.querySelector(sel)?.textContent?.trim().slice(0, 60) ?? '(absent)';
                    return JSON.stringify({
                        url: window.location.href,
                        // The three surfaces the branch chooses between, so the
                        // report says which one was on screen and which were not.
                        loading: text('[data-testid="members-loading"]'),
                        empty: text('[data-testid="members-empty"]'),
                        unavailable: text('[data-testid="members-unavailable"]'),
                        memberRows: document.querySelectorAll('[data-testid^="member-row-"]').length,
                        peerRows: document.querySelectorAll('[data-testid^="peer-row-"]').length,
                    });
                });
            }
            sawEmptyState = true;
        }
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
        'the sidebar said "No members yet" while the member list was still loading. ' +
        `At the first sighting the DOM held: ${atFirstSighting}`,
    ).toBe(false);
});
