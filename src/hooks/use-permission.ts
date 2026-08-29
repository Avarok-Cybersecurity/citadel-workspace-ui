/**
 * Checking one permission for one domain, with a loading state and a reason.
 *
 * There were three of these — `usePermission`, `useAnyPermission`,
 * `useAllPermissions` — with byte-identical bodies apart from the predicate and
 * the sentence in `reason`. Neither of the plural two had a single caller.
 *
 * The duplication was already load-bearing before anyone used it.
 * `useResetOnRoleChange` below fixes a real defect: `clearCache()` on a
 * promotion left every hook with an empty cache AND a guard saying it had
 * already asked, so every gated control stayed denied until a reload. That fix
 * had to be written into all three, and the next fix in this file would have
 * had to be as well — with two of the three copies never exercised, so a
 * mistake in them could not be noticed.
 *
 * Deleted rather than deduplicated behind a predicate argument. Any/all are a
 * parameter away if something ever needs them, and speculative generality is
 * how three copies came to exist.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type React from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import { usePermissions, Permission } from '@/contexts/PermissionsContext';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { nextRetryDelayMs } from './permission-retry';

interface UsePermissionResult {
  /** Whether the user has the permission */
  allowed: boolean;
  /** Whether permissions are being loaded */
  loading: boolean;
  /** Reason for denial (for tooltip) */
  reason: string | null;
  /** Force refresh the permission check */
  refresh: () => Promise<void>;
}

/**
 * Check if user has a specific permission for a domain
 *
 * @param domainId - The domain ID (workspace, office, or room)
 * @param permission - The permission to check
 * @returns Permission check result with loading state and denial reason
 *
 * @example
 * ```tsx
 * const { allowed, loading, reason } = usePermission(nodeId, Permission.EditMdx);
 *
 * if (loading) return <Spinner />;
 * if (!allowed) return <Tooltip content={reason}><DisabledButton /></Tooltip>;
 * return <Button onClick={handleEdit}>Edit</Button>;
 * ```
 */
/**
 * Events after which the answer may be different, so the retry budget starts
 * again.
 *
 * `permissions:role-changed` was the only one. Without it, clearCache() on a
 * promotion left every hook with an empty cache AND a guard saying it had
 * asked — denying every gated control until a reload.
 *
 * The other two are the same failure from the other direction. The budget is
 * four attempts and then silence, forever: a fetch that failed while the
 * connection was still coming up left the control refused for the life of the
 * page, and the reason shown was a denial rather than "we never got an answer".
 * A reconnection, or a switch to a different session, is exactly the moment
 * asking again is worth doing.
 */
const RETRY_AGAIN_AFTER: readonly string[] = [
  'permissions:role-changed',
  'on-ws-connection-success',
  'instance:cid-changed',
];

/**
 * Clears a hook's "already tried this domain" guard, and returns a number that
 * changes each time it does.
 *
 * Clearing the ref alone changes nothing: the fetch effect's dependencies are
 * the domain, the cache and the fetcher, none of which a cleared ref moves. The
 * guard was reset and the effect never re-ran — the reset had no effect at all,
 * which is the same shape as the bug it was written to fix.
 */
function useResetWhenTheAnswerMayChange(
  attempted: React.MutableRefObject<Map<string, number>>,
): number {
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const reset = (): void => {
      attempted.current.clear();
      setGeneration((previous: number): number => previous + 1);
    };
    for (const event of RETRY_AGAIN_AFTER) eventEmitter.on(event, reset);
    return (): void => {
      for (const event of RETRY_AGAIN_AFTER) eventEmitter.off(event, reset);
    };
  }, [attempted]);
  return generation;
}

export function usePermission(
  domainId: string | undefined | null,
  permission: Permission
): UsePermissionResult {
  const {
    hasPermission,
    loading: contextLoading,
    fetchPermissionsForDomain,
    getDeniedReason,
    permissions,
  } = usePermissions();

  const [localLoading, setLocalLoading] = useState(false);
  /** Attempts made per domain, so a failure can be retried and still bounded. */
  const attemptedFetchRef: React.MutableRefObject<Map<string, number>> =
    useRef<Map<string, number>>(new Map());
  const askAgain: number = useResetWhenTheAnswerMayChange(attemptedFetchRef);

  // Fetch this domain's permissions, and try again if the answer never came.
  //
  // This was one attempt, recorded in a Set before the request went out. The
  // guard was right to exist, but `fetchPermissionsForDomain` returns `null` on
  // failure rather than throwing, so a timed-out request during workspace
  // start-up was indistinguishable from a completed one -- and nothing ever
  // triggered a second attempt, because this effect's dependencies only move
  // when a fetch SUCCEEDS. Every gated control on that node stayed disabled for
  // the life of the page, which CI caught as the workspace admin waiting sixty
  // seconds for their own Edit button.
  useEffect(() => {
    if (!domainId || permissions.has(domainId)) return;

    let cancelled: boolean = false;
    let timer: number | undefined;

    const attempt = (): void => {
      const soFar: number = attemptedFetchRef.current.get(domainId) ?? 0;
      const delay: number | null = nextRetryDelayMs(soFar);
      if (cancelled || delay === null) return;

      timer = window.setTimeout(() => {
        if (cancelled) return;
        attemptedFetchRef.current.set(domainId, soFar + 1);
        setLocalLoading(true);
        runAsyncSetup(async () => {
          const result: Awaited<ReturnType<typeof fetchPermissionsForDomain>> =
            await fetchPermissionsForDomain(domainId);
          if (cancelled) return;
          setLocalLoading(false);
          // A null result is a failure, not an empty permission set: the
          // context swallows the error and returns null either way. On success
          // the cache fills and this effect will not run again.
          if (!result) attempt();
        });
      }, delay);
    };

    attempt();
    return (): void => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [domainId, permissions, fetchPermissionsForDomain, askAgain]);

  const refresh: () => Promise<void> = useCallback(async (): Promise<void> => {
    if (!domainId) return;
    setLocalLoading(true);
    await fetchPermissionsForDomain(domainId);
    setLocalLoading(false);
  }, [domainId, fetchPermissionsForDomain]);

  // If no domain ID, return not allowed
  if (!domainId) {
    return {
      allowed: false,
      loading: false,
      reason: 'No domain context available',
      refresh,
    };
  }

  const allowed: boolean = hasPermission(domainId, permission);
  const loading: boolean = contextLoading || localLoading;
  const reason: string | null = allowed ? null : getDeniedReason(domainId, permission);

  return {
    allowed,
    loading,
    reason,
    refresh,
  };
}

export default usePermission;
