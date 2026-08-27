import { useEffect } from 'react';
import { isMemberOnline } from '@/lib/presence';
import { workspaceEvents, type ConnectionInfo } from '@/lib/workspace-events';
import { connectionManager } from '@/lib/connection';
import WorkspaceService from '@/lib/workspace-service';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';
import { setLoading, runAsyncSetup } from './event-setup-utils';
import { debugLog } from '@/lib/debug-config';
import { armLoadingDeadline, cancelLoadingDeadline } from '@/lib/loading-flag-timeout';

interface UseMemberEventSetupProps {
  setState: React.Dispatch<React.SetStateAction<WorkspaceEventState>>;
}

export function useMemberEventSetup({ setState }: UseMemberEventSetupProps): void {
  useEffect(() => {
    const setupMemberListeners = async () => {
      // Member events
      await workspaceEvents.onMemberEvent('members:loading', (payload) => {
        setLoading(setState, 'members', true);
        // listMembers resolves on SEND, not on response — fall back to the empty
        // state rather than a spinner that can never resolve.
        armLoadingDeadline('members', () => setLoading(setState, 'members', false));

        if (payload.domainId) {
          debugLog('UseMemberEventSetup', `Loading members for domain: ${payload.domainId}, request ID: ${payload.connection.request_id}`);
        }
      });

      await workspaceEvents.onMemberEvent('members:loaded', async (payload) => {
        cancelLoadingDeadline('members');
        setState(prev => {
          // Try to find the current user in the members list and update their role
          let updatedCurrentUser = prev.currentUser;
          if (prev.currentUser && payload.members) {
            const currentUserMember = payload.members.find(
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
              const roleToSave = currentUserMember.role;
              if (roleToSave) {
                runAsyncSetup(async () => {
                  const session = await connectionManager.getTabSelectedSession();
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
              const member = m as { id?: string; username?: string; displayName?: string; role?: string };
              const id = member.id || member.username;
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
      });

      // `member:added` / `member:removed` had subscriptions here, but the only
      // emitters lived in handlers for response variants the server never
      // constructs (AddMember/RemoveMember exist as requests only). Both
      // handlers did nothing beyond trackRequest, and the list is refreshed by
      // `members:reload`, emitted from the write path once the server confirms.

      // Member role updated event
      await workspaceEvents.onMemberEvent('member:role-updated', (payload: { userId: string; role: string; connection: ConnectionInfo }) => {
        debugLog('UseMemberEventSetup', 'Member role updated:', payload.userId, payload.role);
        setState(prev => {
          // Update currentUser's role if it matches
          let updatedCurrentUser = prev.currentUser;
          if (prev.currentUser && (prev.currentUser.username === payload.userId || prev.currentUser.id === payload.userId)) {
            debugLog('UseMemberEventSetup', `Updating current user role to: ${payload.role}`);
            updatedCurrentUser = {
              ...prev.currentUser,
              role: payload.role
            };

            // Persist role to stored session for WorkspaceSwitcher (async)
            runAsyncSetup(async () => {
              const session = await connectionManager.getTabSelectedSession();
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
      });

      // User permissions loaded event - updates currentUser's role
      await workspaceEvents.onMemberEvent('user:permissions:loaded', (payload: { userId: string; role: string; connection?: ConnectionInfo }) => {
        debugLog('UseMemberEventSetup', 'User permissions loaded:', payload.userId, payload.role);
        setState(prev => {
          // Update currentUser's role if it matches
          let updatedCurrentUser = prev.currentUser;

          // Check against currentUser username/id OR the stored session username
          const storedSession = connectionManager.getStoredSessionsArray()[0];
          const isCurrentUser = prev.currentUser && (
            prev.currentUser.username === payload.userId ||
            prev.currentUser.id === payload.userId ||
            // Also match if currentUser has placeholder "Loading..." but payload matches stored session
            (prev.currentUser.username === 'Loading...' && storedSession?.username === payload.userId)
          );

          if (isCurrentUser && prev.currentUser) {
            debugLog('UseMemberEventSetup', `Updating current user role from permissions to: ${payload.role}`);
            updatedCurrentUser = {
              ...prev.currentUser,
              // Also update username if it was 'Loading...'
              username: prev.currentUser.username === 'Loading...' ? payload.userId : prev.currentUser.username,
              id: prev.currentUser.id === 'Loading...' ? payload.userId : prev.currentUser.id,
              role: payload.role
            };

            // Persist role to stored session for WorkspaceSwitcher (async)
            runAsyncSetup(async () => {
              const session = await connectionManager.getTabSelectedSession();
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
      });

      // Members reload event
      await workspaceEvents.onWorkspaceEvent('members:reload', async () => {
        debugLog('UseMemberEventSetup', 'Reloading members list...');
        const params = new URLSearchParams(window.location.search);
        const domainId = params.get("nodeId");
        if (domainId) {
          await WorkspaceService.listMembers(domainId);
        }
      });
    };

    runAsyncSetup(setupMemberListeners);
  }, [setState]);
}
