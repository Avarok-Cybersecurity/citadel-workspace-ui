import { useEffect, useState } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import WorkspaceService from '@/lib/workspace-service';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { TIMEOUT } from '@/lib/timeout-constants';

export type PermissionsLoad =
  | { status: 'loading' }
  | { status: 'loaded'; permissions: Set<string>; role: string }
  | { status: 'failed'; reason: string };

/**
 * What the SERVER currently grants this user in this domain.
 *
 * The permission editor used to call `getUserPermissions` and discard the
 * result — even on success. Nothing ever wrote the response into state, so the
 * matrix always rendered `getRoleDefaultPermissions()` constants, and Save
 * diffed the admin's edits against those same client-side defaults rather than
 * against what the server actually had. An admin "reviewing" permissions was
 * reading fiction, and saving pushed the defaults over whatever the server was
 * really enforcing: a silent reset, or a silent escalation.
 *
 * So this hook exists to make the read side real, and to make the three states
 * distinguishable — because "still loading" and "failed to load" both used to
 * look exactly like "these are the permissions".
 */
export function useLoadedPermissions(userId: string, domainId: string): PermissionsLoad {
  const [load, setLoad] = useState<PermissionsLoad>({ status: 'loading' });

  useEffect(() => {
    setLoad({ status: 'loading' });
    let settled: boolean = false;

    const onLoaded = (payload: {
      userId: string;
      domainId: string;
      role: string;
      permissions: string[];
    }) => {
      // Both, because one editor can be open while another domain's response
      // arrives — and the response is the only thing that says which is which.
      if (payload.userId !== userId || payload.domainId !== domainId) return;
      settled = true;
      setLoad({
        status: 'loaded',
        permissions: new Set(payload.permissions),
        role: payload.role,
      });
    };

    const unsubscribe: () => void = eventEmitter.on('user:permissions:loaded', onLoaded);

    const timer: NodeJS.Timeout = setTimeout((): void => {
      if (settled) return;
      // A silent timeout would leave the matrix showing defaults for ever,
      // which is exactly the state this hook exists to make impossible.
      setLoad({
        status: 'failed',
        reason: 'The server did not answer. These may not be the current permissions.',
      });
    }, TIMEOUT.PERMISSION_FETCH_MS);

    runAsyncSetup(async () => {
      try {
        await WorkspaceService.getUserPermissions(userId, domainId);
      } catch (error) {
        debugLog('PermissionManager', 'Error loading permissions:', error);
        settled = true;
        setLoad({
          status: 'failed',
          reason: error instanceof Error ? error.message : 'Could not load permissions.',
        });
      }
    });

    return (): void => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [userId, domainId]);

  return load;
}
