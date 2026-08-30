/**
 * What `usePermission` answers, and why three of the four fields exist.
 *
 * Split from the hook for the length cap. The comments are the point: each of
 * `unanswered`, `answered` and `reason` was added after a surface rendered a
 * denial for something that was not one.
 */

export interface UsePermissionResult {
  /** Whether the user has the permission */
  allowed: boolean;
  /** Whether permissions are being loaded */
  loading: boolean;
  /** Reason for denial (for tooltip) */
  reason: string | null;
  /**
   * `true` when the retry budget ran out without an answer, so `allowed` is
   * false for want of a reply rather than because the answer was no.
   *
   * Exposed as a value because the first consumer reconstructed it by testing
   * `reason.startsWith('Your permissions here could not be checked')` — a
   * component matching on a sentence it does not own. Reword the sentence and
   * that check goes quietly false forever, and the surface it guards goes back
   * to telling a workspace owner that an admin set their theme.
   */
  unanswered: boolean;
  /**
   * `false` when no answer for this domain has been stored at all.
   *
   * `hasPermission` returns `false` for a cache MISS, which is
   * indistinguishable from a real denial at the call site. A surface that hides
   * something on `!allowed` therefore hides it for a question whose answer was
   * never recorded -- which is how the office composer disappeared for every
   * user in a three-user run. `loading` does not cover it: the fetch may not
   * have been started, or may have completed for a different domain.
   */
  answered: boolean;
  /** Force refresh the permission check */
  refresh: () => Promise<void>;
}

/**
 * Whether this answer permits the control, treating every not-a-denial as yes.
 *
 * There are four states that are not the answer "no", and each one was learned
 * from a surface that had refused a user something they were entitled to:
 *
 *   - `allowed`   — the answer was yes;
 *   - `loading`   — nobody has answered yet;
 *   - `unanswered`— the retry budget ran out, so this is a failed request;
 *   - `!answered` — no answer for this domain is stored at all, which
 *                   `hasPermission` reports as `false`, indistinguishable from
 *                   a refusal.
 *
 * Spelling that out at each call site is how they drifted: the office composer
 * had three of the four and withheld itself from every user in a three-user
 * run; the theme editor had two; `BaseOffice` had none and disabled Edit for
 * anyone whose permissions had not loaded.
 *
 * A gate that hides a control must therefore ask this, not `allowed`. Reading
 * `allowed` to DISPLAY the permission itself is a different question and stays
 * fine.
 */
export function permits(result: UsePermissionResult): boolean {
  return result.allowed || result.loading || result.unanswered || !result.answered;
}
