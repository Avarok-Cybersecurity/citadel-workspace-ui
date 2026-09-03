/**
 * Why a permission-gated control is in the state it is in.
 *
 * Two controls ask this question and both learned it the hard way. The office
 * composer (round 394) logs the role and the four states when it WITHHOLDS
 * itself, because CI showed it withheld from somebody who should have been able
 * to send. The office Edit button asks the opposite (round 447): it is offered
 * while the answer is still outstanding, deliberately, so a slow answer and a
 * wrong answer look identical from outside.
 *
 * One shape for both, because the useful thing is the same in either
 * direction — which of the four states produced the decision, and on which
 * domain, since `hasPermission` falls back to the workspace root.
 *
 * Logged rather than shown. The reader gets the truthful sentence for their
 * situation; these four fields are for whoever is reading a failing run.
 */
import { debugLog } from '@/lib/debug-config';
import { permits } from '@/hooks/use-permission-result';
import type { UsePermissionResult } from '@/hooks/use-permission-result';

export function logPermissionState(
  where: string,
  what: string,
  domainId: string | null | undefined,
  result: UsePermissionResult,
  extra?: Record<string, unknown>,
): void {
  debugLog(where, what, {
    domainId,
    allowed: result.allowed,
    answered: result.answered,
    loading: result.loading,
    unanswered: result.unanswered,
    reason: result.reason,
    ...extra,
  });
}

/**
 * Log a privileged control that is being OFFERED without anybody having said
 * yes -- `permits()` is true while an answer is outstanding, by design, so this
 * is the state where a slow answer and a wrong answer look identical.
 *
 * The condition lives here rather than at the call site: it is part of the
 * diagnostic, not part of the component.
 */
export function logOfferedWithoutAnswer(
  where: string,
  what: string,
  domainId: string | null | undefined,
  result: UsePermissionResult,
  offered: boolean,
): void {
  if (!domainId || !offered || result.allowed) return;
  logPermissionState(where, what, domainId, result);
}

/**
 * `permits`, and a line in the log when it says yes without anybody having
 * answered.
 *
 * `permits` rather than `allowed` because an unanswered question is not a
 * refusal: reading a cache MISS as false showed a disabled Edit button and a
 * reason explaining why the user may not, for a question nobody had answered.
 * That is the bug rounds 378-395 spent four rounds removing, and it must not
 * come back through this door.
 *
 * Written to REPLACE the `permits(...)` call rather than sit beside it: a
 * diagnostic that explains a decision belongs at the decision, and a call site
 * that has to remember to log is one that will forget.
 */
export function permitsAndReport(
  where: string,
  what: string,
  domainId: string | null | undefined,
  result: UsePermissionResult,
): boolean {
  const offered: boolean = permits(result);
  logOfferedWithoutAnswer(where, what, domainId, result, offered);
  return offered;
}
