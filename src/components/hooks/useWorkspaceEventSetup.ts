import { useEffect } from 'react';
import { workspaceEvents } from '@/lib/workspace-events';
import { broadcastChannelService } from '@/lib/broadcast-channel-service';
import { connectionManager } from '@/lib/connection';
import UserService from '@/lib/user-service';
import { bytesToString } from '@/lib/utils/encoding-utils';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';
import { setLoading, runAsyncSetup } from './event-setup-utils';
import { debugLog } from '@/lib/debug-config';
import type { UserRegistrationInfo } from '@/lib/user-service';
import type { StoredSession } from '@/types/session-types';

interface UseWorkspaceEventSetupProps {
  setState: React.Dispatch<React.SetStateAction<WorkspaceEventState>>;
}

export function useWorkspaceEventSetup({ setState }: UseWorkspaceEventSetupProps): void {
  useEffect(() => {
    // Kept, not discarded.
    //
    // `onMemberEvent` and `onWorkspaceEvent` return their unsubscribe
    // SYNCHRONOUSLY, and `await` on a plain value throws nothing away by
    // itself -- but nothing here captured the result, and the effect returned
    // no cleanup. Every remount left another set of live listeners behind, each
    // retaining a closure over `setState`, and every event then ran an
    // ever-growing pile of dead handlers.
    //
    // Nothing broke visibly, because setState on an unmounted component is a
    // no-op, which is exactly why it accumulated. `use-domain-members` carries
    // the same paragraph about the same mistake, fixed there and not here.
    //
    // The sibling `useMessageEventSetup` calls `cleanupAllListeners()` on
    // unmount, which does remove these -- and also removes every listener this
    // hook did not create. That is not a substitute for owning your own
    // unsubscribe.
    const unsubscribes: Array<() => void> = [];
    let cancelled: boolean = false;
    /** Unsubscribes immediately if the effect has already been cleaned up. */
    const keep = (unsubscribe: () => void): void => {
      if (cancelled) unsubscribe();
      else unsubscribes.push(unsubscribe);
    };

    const setupWorkspaceListeners = async (): Promise<void> => {
      // Loading state
      keep(workspaceEvents.onWorkspaceEvent('workspace:loading', () => {
        setLoading(setState, 'workspace', true);
      }));

      // Workspace loaded event
      keep(workspaceEvents.onWorkspaceEvent('workspace:loaded', async (payload) => {
        const rawMetadata: Record<string, unknown> | undefined = payload.workspace.metadata;

        // Parse metadata as JSON to check initialization status
        let isInitialized: boolean = false;
        let parsedMetadata: Record<string, unknown> | undefined;
        try {
          if (rawMetadata && typeof rawMetadata === 'object') {
            if (Array.isArray(rawMetadata) && rawMetadata.length > 0) {
              const metadataString: string = bytesToString(rawMetadata as number[]);
              parsedMetadata = JSON.parse(metadataString);
              isInitialized = parsedMetadata?.initialized === true;
            } else if (!Array.isArray(rawMetadata)) {
              parsedMetadata = rawMetadata;
              isInitialized = parsedMetadata?.initialized === true;
            }
          }
        } catch (error) {
          debugLog('UseWorkspaceEventSetup', 'Failed to parse workspace metadata as JSON:', error);
          isInitialized = false;
        }

        setState(prev => ({
          ...prev,
          workspace: {
            id: payload.workspace.id,
            name: payload.workspace.name,
            metadata: parsedMetadata
          },
          loading: { ...prev.loading, workspace: false },
          needsWorkspaceInitialization: !isInitialized,
        }));

        // Broadcast workspace state to other tabs
        broadcastChannelService.broadcastStateSync({
          type: 'workspace',
          data: {
            workspace: { id: payload.workspace.id, name: payload.workspace.name, metadata: parsedMetadata },
            loading: { workspace: false },
            needsWorkspaceInitialization: !isInitialized,
          }
        });

        // Try to load user information if not already loaded
        const userService: typeof UserService = UserService;
        const currentUser: UserRegistrationInfo | null = await userService.getCurrentUser();

        if (currentUser) {
          const storedSession: StoredSession | null = await connectionManager.getTabSelectedSession();
          const role: string | undefined = storedSession?.role;

          setState(prev => ({
            ...prev,
            currentUser: {
              id: currentUser.username,
              username: currentUser.username,
              name: currentUser.fullName || currentUser.username,
              role: role
            }
          }));
        }

        // `listWorkspaces()` used to run here on every workspace load, and its
        // result was written into `state.workspaces` -- which nothing in the
        // tree ever read. A network round trip per load feeding dead state, and
        // a field in the context type that made the app look as though it
        // tracked a workspace list. The switcher reads stored sessions, not
        // this. Removed rather than left as a decoy; one line brings it back if
        // something ever needs it.
      }));

      // Workspace not initialized event
      keep(workspaceEvents.onWorkspaceEvent('workspace:not-initialized', () => {
        setState(prev => ({
          ...prev,
          needsWorkspaceInitialization: true,
          loading: { ...prev.loading, workspace: false }
        }));
      }));
    };

    runAsyncSetup(setupWorkspaceListeners);

    return (): void => {
      cancelled = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
      unsubscribes.length = 0;
    };
  }, [setState]);
}
