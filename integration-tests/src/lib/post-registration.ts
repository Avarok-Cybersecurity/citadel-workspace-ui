import type { Page } from 'playwright';

/**
 * Wait for the app to finish leaving the registration wizard.
 *
 * After the server accepts registration (and, for the first user,
 * initialisation) the wizard stays on its Profile step while Landing runs
 * postAuthSetup and only then navigates. And the URL changing is not the end
 * of it: the workspace routes are lazy, so React keeps the previous screen --
 * wizard included -- on screen until the chunk loads. Measured on the dev
 * server: the "Create your profile" overlay was still 1280x720 at opacity 1
 * some 800ms after the URL read /workspace.
 *
 * Sweeping modals inside either window presses Escape on the wizard, which
 * is "back" (Profile, Security, Server), then clicks its own Cancel, and the
 * account just created ends on the landing page with a live session chip and
 * no workspace. A slow CI runner happened to navigate first; a fast local
 * stack never did. So: wait for both, on a budget, and log each gap. A
 * refused registration never navigates; the caller's rejection race reports
 * that, so this must not throw.
 */
export async function waitForRegistrationToSettle(page: Page): Promise<void> {
  const navWait = Date.now();
  const navigated = await page
    .waitForURL(/\/(workspace|office)/, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!navigated) {
    console.log('  Did not enter the workspace within 30s of registration');
    return;
  }
  console.log(`  Entered the workspace ${Date.now() - navWait}ms after registration`);

  const overlayWait = Date.now();
  const wizard = page.locator('[aria-label="Create your profile"]');
  const gone = await wizard
    .waitFor({ state: 'detached', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  console.log(
    gone
      ? `  Registration wizard left the screen ${Date.now() - overlayWait}ms after navigation`
      : '  Registration wizard STILL ON SCREEN 15s after navigation'
  );
}
