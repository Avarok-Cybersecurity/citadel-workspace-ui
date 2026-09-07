import { isPlaceholderName } from '@/lib/peer-display';
import { useEffect } from 'react';
import { isMemberOnline } from '@/lib/presence';
import { workspaceEvents, type ConnectionInfo } from '@/lib/workspace-events';
import { connectionManager } from '@/lib/connection';
import WorkspaceService from '@/lib/workspace-service';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';
import { setLoading, runAsyncSetup } from './event-setup-utils';
import { debugLog } from '@/lib/debug-config';
import { armLoadingDeadline, cancelLoadingDeadline } from '@/lib/loading-flag-timeout';
import type { User, UserRole } from '@/types/workspace-entities';
import type { StoredSession } from '@/types/session-types';
import { isForDomain } from '@/lib/workspace-events/is-for-domain';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';

interface UseMemberEventSetupProps {
  setState: React.Dispatch<React.SetStateAction<WorkspaceEventState>>;
}

export function useMemberEventSetup({ setState }: UseMemberEventSetupProps): void {
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

    const setupMemberListeners = async (): Promise<void> => {
      // Member events
      keep(workspaceEvents.onMemberEvent('members:loading', (payload) => {
        setLoading(setState, 'members', true);
        // listMembers resolves on SEND, not on response — fall back to the empty
        // state rather than a spinner that can never resolve.
        armLoadingDeadline('members', () => setLoading(setState, 'members', false));

        if (payload.domainId) {
          debugLog('UseMemberEventSetup', `Loading members for domain: ${payload.domainId}, request ID: ${payload.connection.request_id}`);
        }
      }));

      keep(workspaceEvents.onMemberEvent('members:loaded', async (payload) => {
        // The FOURTH subscriber `is-for-domain` names, and the one that did not
        // have this check. It writes the global `state.members`, which is what
        // `UserSearch.tsx:99` and `UserDirectory.tsx:58` read as "everyone in
        // this workspace" -- so a roster fetched for a ROOM replaced it, and
        // searching for a real workspace member returned "No users found" until
        // something re-fetched the workspace list.
        //
        // The omission survived because the comment on the wrong hook claimed
        // the corpus: `use-domain-members.ts:79-81` says "this hook's members
        // are the corpus the user search searches", and the user search does
        // not read that hook. The guard went where the comment pointed.
        //
        // Compared against WORKSPACE_ROOT_ID rather than the active domain: this
        // state is workspace-wide by definition, so a room's list is never the
        // one it asked for, whatever the sidebar is showing.
        if (!isForDomain(payload.domainId, WORKSPACE_ROOT_ID)) return;
        cancelLoadingDeadline('members');
        setState(prev => {
          // Try to find the current user in the members list and update their role
          let updatedCurrentUser: { id: string; username: string; name: string; role?: string; displayName?: string; avatarUrl?: string; } | undefined = prev.currentUser;
          if (prev.currentUser && payload.members) {
            const currentUserMember: User | undefined = payload.members.find(
              (m: { username?: string; role?: string; displayName?: string }) =>
                m.username === prev.currentUser?.username
            );
            if (currentUserMember && currentUserMember.role) {
              debugLog('UseMemberEventSetup', `Updating current user role to: ${currentUserMember.role}`);
              updatedCurrentUser = {
                ...prev.currentUser,
                role: currentUserMember.role,
                displayName: currentUserMember.displayName || prev.currentUser.name
              };

              // Persist role to stored session for WorkspaceSwitcher (async)
              const roleToSave: UserRole = currentUserMember.role;
              if (roleToSave) {
                runAsyncSetup(async () => {
                  const session: StoredSession | null = await connectionManager.getTabSelectedSession();
                  if (session) {
                    await connectionManager.updateSessionRole(session.username, session.serverAddress, roleToSave);
                  }
                });
              }
            }
          }

          // Build members record from the already-mapped array.
          //
          // The workspace-handlers layer (mapWasmMember) is SSOT for
          // WASM→UI field normalisation, so this loop does NOT re-derive
          // username/displayName from the raw `name` field - we just
          // consume what the handler produced. That keeps the two layers
          // from drifting apart.
          //
          // Members without any stable identifier are skipped (rather than
          // keyed under Math.random()) so that repeated `members:loaded`
          // events cannot accumulate phantom duplicates.
          const membersRecord: Record<string, import('@/types/workspace-entities').User> = {};
          if (payload.members) {
            for (const m of payload.members) {
              const member: { id?: string; username?: string; displayName?: string; role?: string; } = m as { id?: string; username?: string; displayName?: string; role?: string };
              const id: string | undefined = member.id || member.username;
              if (!id) {
                debugLog('UseMemberEventSetup', 'Dropping member with no stable id/username', member);
                continue;
              }
              membersRecord[id] = {
                id,
                username: member.username || id,
                displayName: member.displayName || member.username || id,
                role: member.role as import('@/types/workspace-entities').UserRole | undefined,
                // Real presence rather than a constant. A member arriving from
                // a member event was recorded as offline whatever the registry
                // said, so anyone rendering this record showed a grey dot for a
                // peer the sidebar was showing as online at the same moment.
                isOnline: isMemberOnline(id),
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
            }
          }

          return {
            ...prev,
            currentUser: updatedCurrentUser,
            members: membersRecord,
            loading: { ...prev.loading, members: false },
          };
        });
      }));

      // `member:added` / `member:removed` had subscriptions here, but the only
      // emitters lived in handlers for response variants the server never
      // constructs (AddMember/RemoveMember exist as requests only). Both
      // handlers did nothing beyond trackRequest, and the list is refreshed by
      // `members:reload`, emitted from the write path once the server confirms.

      // Member role updated event
      keep(workspaceEvents.onMemberEvent('member:role-updated', (payload: { userId: string; role: string; connection: ConnectionInfo }) => {
        debugLog('UseMemberEventSetup', 'Member role updated:', payload.userId, payload.role);
        setState(prev => {
          // Update currentUser's role if it matches
          let updatedCurrentUser: { id: string; username: string; name: string; role?: string; displayName?: string; avatarUrl?: string; } | undefined = prev.currentUser;
          if (prev.currentUser && (prev.currentUser.username === payload.userId || prev.currentUser.id === payload.userId)) {
            debugLog('UseMemberEventSetup', `Updating current user role to: ${payload.role}`);
            updatedCurrentUser = {
              ...prev.currentUser,
              role: payload.role
            };

            // Persist role to stored session for WorkspaceSwitcher (async)
            runAsyncSetup(async () => {
              const session: StoredSession | null = await connectionManager.getTabSelectedSession();
              if (session) {
                await connectionManager.updateSessionRole(session.username, session.serverAddress, payload.role);
              }
            });
          }
          return {
            ...prev,
            currentUser: updatedCurrentUser,
          };
        });
      }));

      // User permissions loaded event - updates currentUser's role
      keep(workspaceEvents.onMemberEvent('user:permissions:loaded', (payload: { userId: string; role: string; connection?: ConnectionInfo }) => {
        debugLog('UseMemberEventSetup', 'User permissions loaded:', payload.userId, payload.role);
        setState(prev => {
          // Update currentUser's role if it matches
          let updatedCurrentUser: { id: string; username: string; name: string; role?: string; displayName?: string; avatarUrl?: string; } | undefined = prev.currentUser;

          // Check against currentUser username/id OR the stored session username
          const storedSession: StoredSession = connectionManager.getStoredSessionsArray()[0];
          const isCurrentUser: boolean | undefined = prev.currentUser && (
            prev.currentUser.username === payload.userId ||
            prev.currentUser.id === payload.userId ||
            // Also match if currentUser has placeholder "Loading..." but payload matches stored session
            (isPlaceholderName(prev.currentUser.username) && storedSession?.username === payload.userId)
          );

          if (isCurrentUser && prev.currentUser) {
            debugLog('UseMemberEventSetup', `Updating current user role from permissions to: ${payload.role}`);
            updatedCurrentUser = {
              ...prev.currentUser,
              // Also update username if it was 'Loading...'
              username: isPlaceholderName(prev.currentUser.username) ? payload.userId : prev.currentUser.username,
              id: isPlaceholderName(prev.currentUser.id) ? payload.userId : prev.currentUser.id,
              role: payload.role
            };

            // Persist role to stored session for WorkspaceSwitcher (async)
            runAsyncSetup(async () => {
              const session: StoredSession | null = await connectionManager.getTabSelectedSession();
              if (session) {
                await connectionManager.updateSessionRole(session.username, session.serverAddress, payload.role);
              }
            });
          }
          return {
            ...prev,
            currentUser: updatedCurrentUser,
          };
        });
      }));

      // Members reload event
      keep(workspaceEvents.onWorkspaceEvent('members:reload', async () => {
        debugLog('UseMemberEventSetup', 'Reloading members list...');
        const params: URLSearchParams = new URLSearchParams(window.location.search);
        const domainId: string | null = params.get("nodeId");
        if (domainId) {
          await WorkspaceService.listMembers(domainId);
        }
      }));
    };

    runAsyncSetup(setupMemberListeners);

    return (): void => {
      cancelled = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
      unsubscribes.length = 0;
    };
  }, [setState]);
}
