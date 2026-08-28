import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Open the account menu and press one of its items.
 *
 * Two things make this harder than one click, and both were solved once and
 * then not propagated.
 *
 * **The menu closes under you.** The workspace keeps streaming data in for a
 * while after it first renders, and a re-render dismisses an open Radix
 * dropdown. Clicking the avatar once and then waiting on an item means waiting
 * forever on a menu that closed a frame after it opened. `workspace-theme` and
 * `responsive` each grew their own retry loop; `accessibility` never got one.
 *
 * **A forced click on the item cannot land.** Radix positions the content
 * asynchronously, and `{ force: true }` skips exactly the wait that lets it
 * finish. Playwright then reports "Element is outside of the viewport" after
 * "done scrolling" — because a `position: fixed` popper cannot be scrolled into
 * view. That failed the light-mode accessibility scan three times in a row in
 * CI, and the scan below it never ran.
 *
 * So: force the avatar (the churn is real and the trigger is a plain button),
 * retry until the item appears, then click the item WITHOUT force so
 * actionability does its job.
 */
export async function pressAccountMenuItem(page: Page, testId: string): Promise<void> {
  const item: Locator = page.getByTestId(testId);

  await expect(async () => {
    await page.getByTestId('user-avatar-button').click({ force: true });
    await expect(item).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });

  // In the viewport, not merely visible: `toBeVisible` is satisfied by a popper
  // that has been rendered but not yet positioned, which is the state the
  // forced click used to fail on.
  await expect(item).toBeInViewport({ timeout: 10_000 });
  await item.click();
}
