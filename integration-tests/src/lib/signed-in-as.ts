/**
 * Which user is signed in, rather than whether a workspace is on screen.
 *
 * `waitForWorkspaceLoaded` looks for sidebar labels, a workspace name, section
 * headers. Every one of those is present for ANY signed-in user, so a spec that
 * asks "can this account still log in?" by attempting a login and waiting for a
 * workspace gets `true` whenever a workspace appears — including when
 * ServerAutoConnect quietly reconnected somebody else's still-live session.
 *
 * `previous-sessions` does exactly that to check a deregistration was
 * permanent, with two other live sessions in the same browser. Its
 * `Deregister Permanent: FAIL` cannot be read as "the account survived" until
 * the assertion can name whose workspace it is looking at.
 *
 * The account menu button carries it: `Account menu for alice`, or
 * `Account menu for alice (workspace administrator)`.
 */

/** The username in an account-menu aria-label, or null if it is not one. */
export function usernameFromAccountLabel(label: string | null): string | null {
  if (!label) return null;
  const match = /^Account menu for (.+?)(?: \(workspace administrator\))?$/.exec(label.trim());
  if (!match) return null;
  const username = match[1].trim();
  // The TopBar falls back to the literal "User" when it knows no name. That is
  // the absence of an answer, not an account called User.
  return username === '' || username === 'User' ? null : username;
}

/**
 * Who the page says is signed in, or null if it does not say.
 *
 * Reads the account-menu button rather than any workspace chrome, because the
 * chrome is identical for every user.
 */
export async function signedInAs(page: {
  locator: (selector: string) => {
    first: () => { getAttribute: (name: string) => Promise<string | null>; count: () => Promise<number> };
  };
}): Promise<string | null> {
  const button = page.locator('[data-testid="user-avatar-button"]').first();
  if ((await button.count()) === 0) return null;
  return usernameFromAccountLabel(await button.getAttribute('aria-label'));
}
