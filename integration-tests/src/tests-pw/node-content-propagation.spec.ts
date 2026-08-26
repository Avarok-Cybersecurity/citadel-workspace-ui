/**
 * A document edit has to reach the other members.
 *
 * The server broadcasts NodeContentUpdated to every member EXCEPT the editor,
 * and nothing in the UI handled it — the editor saw their own change and
 * everyone else kept rendering the copy they had loaded. Nothing caught it
 * because content editing was only ever tested with ONE account
 * (office-mdx-content.test.ts), so the only path that carries the update to a
 * second person was never exercised.
 *
 * Two users, one workspace, no reload: that last part is the whole point. A
 * test that reloads B would pass against a refetch and prove nothing about the
 * broadcast.
 */
import { expect } from '@playwright/test';
import { multiUserTest } from '../fixtures/multi-user.fixture.js';
import type { Page } from '@playwright/test';

const editButton = (page: Page) => page.getByRole('button', { name: 'Edit', exact: true }).first();
const mdxTextarea = (page: Page) => page.getByPlaceholder(/Write your office content/i).first();
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save Changes' }).first();
const rendered = (page: Page) => page.locator('div.prose').first();

// fixme, not skip: the test is right and the product is not. It cannot pass
// while the workspace creator has no EditMdx on any office — see
// docs/KNOWN_ISSUES.md, "The workspace creator cannot edit any document".
// Written now because it is the reproduction, and it should go green the moment
// that is fixed rather than being rediscovered.
multiUserTest.fixme('an edit by one member reaches the other without a reload', async ({ userA, userB }) => {
    multiUserTest.setTimeout(300_000);
    const marker = `Propagated at ${Date.now()}`;

    // B is looking at the document before the edit happens, which is what makes
    // this about the broadcast rather than about what B fetches on arrival.
    await expect(rendered(userB.page)).toBeVisible({ timeout: 60_000 });
    await expect(rendered(userB.page)).not.toContainText(marker);

    // A edits. The Edit control is permission-gated and the grant arrives
    // asynchronously, so this waits for it to become usable rather than
    // assuming it is.
    await expect(editButton(userA.page)).toBeEnabled({ timeout: 60_000 });
    await editButton(userA.page).click({ force: true });

    const textarea = mdxTextarea(userA.page);
    await expect(textarea).toBeVisible({ timeout: 30_000 });
    await textarea.fill(`# ${marker}\n\nEdited by ${userA.username}.`);
    await saveButton(userA.page).click({ force: true });

    // A sees their own change — if this fails the edit never saved, which is a
    // different defect from the one under test.
    await expect(rendered(userA.page)).toContainText(marker, { timeout: 60_000 });

    // The assertion that matters: B, untouched, shows it too.
    await expect(
        rendered(userB.page),
        'B never received the update — NodeContentUpdated is not reaching the UI',
    ).toContainText(marker, { timeout: 60_000 });
});
