/**
 * The creator's email address at /create: where the claim code and its claim link are sent.
 *
 * Checked here only so the form can say "that is not an address" before sending it; the control
 * plane's `emailOf` (deploy/tenant-worker/control/owner-email.mjs) is the rule that decides.
 */
export const MAX_EMAIL_LENGTH: number = 254;

const ADDRESS: RegExp =
  /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isEmailAddress(value: string): boolean {
  const trimmed: string = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_EMAIL_LENGTH && ADDRESS.test(trimmed);
}

/** Why the two entries cannot be used yet, or null when they can. */
export function emailProblem(email: string, confirmation: string): string | null {
  if (!isEmailAddress(email)) return 'Enter the email address the claim code should go to.';
  if (email.trim().toLowerCase() !== confirmation.trim().toLowerCase()) return 'The two addresses are different.';
  return null;
}
