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
 * test that reloads the observer would pass against a refetch and prove nothing
 * about the broadcast.
 */
import { expect } from '@playwright/test';
import { adminMemberTest } from '../fixtures/multi-user.fixture.js';
import type { Page } from '@playwright/test';

const editButton = (page: Page) => page.getByRole('button', { name: 'Edit', exact: true }).first();
const mdxTextarea = (page: Page) => page.getByPlaceholder(/Write your office content/i).first();
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save Changes' }).first();
const rendered = (page: Page) => page.locator('div.prose').first();

// The editor here is the admin, not an arbitrary member: EditMdx belongs to
// Owner and Admin by design, so a two-member fixture can never get past the Edit
// button. That gate is what this spec used to be blocked on — the workspace was
// seeded at boot, nobody was ever promoted, and no account could edit anything.
adminMemberTest('an edit by the admin reaches a member without a reload', async ({ admin, member }) => {
    adminMemberTest.setTimeout(300_000);
    const marker = `Propagated at ${Date.now()}`;

    // The member is looking at the document before the edit happens, which is
    // what makes this about the broadcast rather than about what they fetch on
    // arrival.
    await expect(rendered(member.page)).toBeVisible({ timeout: 60_000 });
    await expect(rendered(member.page)).not.toContainText(marker);

    // The Edit control is permission-gated and the grant arrives asynchronously,
    // so this waits for it to become usable rather than assuming it is.
    await expect(editButton(admin.page)).toBeEnabled({ timeout: 60_000 });
    await editButton(admin.page).click({ force: true });

    const textarea = mdxTextarea(admin.page);
    await expect(textarea).toBeVisible({ timeout: 30_000 });
    await textarea.fill(`# ${marker}\n\nEdited by ${admin.username}.`);
    await saveButton(admin.page).click({ force: true });

    // The editor sees their own change — if this fails the edit never saved,
    // which is a different defect from the one under test.
    await expect(rendered(admin.page)).toContainText(marker, { timeout: 60_000 });

    // The assertion that matters: the member's page, untouched, shows it too.
    await expect(
        rendered(member.page),
        'the member never received the update — NodeContentUpdated is not reaching the UI',
    ).toContainText(marker, { timeout: 60_000 });
});
