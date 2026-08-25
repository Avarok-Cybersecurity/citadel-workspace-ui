import type { Locator } from '@playwright/test';

/**
 * Wait up to `timeout` for `locator` to become visible, reporting whether it
 * appeared rather than throwing. For OPTIONAL flows only — "claim the existing
 * session if one is offered", "open the advanced panel if it is collapsed".
 *
 * The obvious spelling does not do this. `locator.isVisible({ timeout })` looks
 * like it waits, and Playwright's own types declare that option
 * `@deprecated This option is ignored` — the call returns immediately. An
 * element that merely has not rendered yet therefore reads as absent, the branch
 * is skipped, and every assertion inside it silently never runs. The test still
 * passes, having checked nothing, and it does this most readily on a loaded CI
 * runner where the render is slowest.
 *
 * For assertions use `expect(locator).toBeVisible()`, which retries. This helper
 * exists purely for branching, where throwing would be wrong.
 */
export async function appearsWithin(locator: Locator, timeout: number): Promise<boolean> {
  return locator
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}
