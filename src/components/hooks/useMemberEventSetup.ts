/**
 * useMemberEventSetup Hook
 *
 * Sets up member-level event listeners for loading, loaded, added, role-updated, removed events.
 * Extracted from WorkspaceEventHandler.tsx to reduce file size.
 */

import { useEffect } from 'react';
import { workspaceEvents, type ConnectionInfo } from '@/lib/workspace-events';
import { connectionManager } from '@/lib/connection';
import WorkspaceService from '@/lib/workspace-service';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';

interface UseMemberEventSetupProps {
  setState: React.Dispatch<React.SetStateAction<WorkspaceEventState>>;
}

export function useMemberEventSetup({ setState }: UseMemberEventSetupProps): void {
  useEffect(() => {
    const setupMemberListeners = async () => {
      // Member events
      await workspaceEvents.onMemberEvent('members:loading', (payload) => {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, members: true },
          lastRequestId: payload.connection.request_id
        }));

        if (payload.officeId) {
          console.info(`Loading members for office: ${payload.officeId}, request ID: ${payload.connection.request_id}`);
        } else if (payload.roomId) {
          console.info(`Loading members for room: ${payload.roomId}, request ID: ${payload.connection.request_id}`);
        }
      });

      await workspaceEvents.onMemberEvent('members:loaded', async (payload) => {
        setState(prev => {
          // Try to find the current user in the members list and update their role
          let updatedCurrentUser = prev.currentUser;
          if (prev.currentUser && payload.members) {
            const currentUserMember = payload.members.find(
              (m: { username?: string; role?: string; displayName?: string }) =>
                m.username === prev.currentUser?.username
            );
            if (currentUserMember && currentUserMember.role) {
              console.info(`Updating current user role to: ${currentUserMember.role}`);
              updatedCurrentUser = {
                ...prev.currentUser,
                role: currentUserMember.role,
                displayName: currentUserMember.displayName || prev.currentUser.name
              };

              // Persist role to stored session for WorkspaceSwitcher (async)
              const roleToSave = currentUserMember.role;
              if (roleToSave) {
                (async () => {
                  const session = await connectionManager.getTabSelectedSession();
                  if (session) {
                    await connectionManager.updateSessionRole(session.username, session.serverAddress, roleToSave);
                  }
                })().catch(console.error);
              }
            }
          }

          return {
            ...prev,
            currentUser: updatedCurrentUser,
            loading: { ...prev.loading, members: false },
            lastRequestId: payload.connection.request_id
          };
        });
      });

      // Member added event
      await workspaceEvents.onMemberEvent('member:added', (payload: { member: unknown; connection: ConnectionInfo }) => {
        console.info('Member added:', payload.member);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      // Member role updated event
      await workspaceEvents.onMemberEvent('member:role-updated', (payload: { userId: string; role: string; connection: ConnectionInfo }) => {
        console.info('Member role updated:', payload.userId, payload.role);
        setState(prev => {
          // Update currentUser's role if it matches
          let updatedCurrentUser = prev.currentUser;
          if (prev.currentUser && (prev.currentUser.username === payload.userId || prev.currentUser.id === payload.userId)) {
            console.info(`Updating current user role to: ${payload.role}`);
            updatedCurrentUser = {
              ...prev.currentUser,
              role: payload.role
            };

            // Persist role to stored session for WorkspaceSwitcher (async)
            (async () => {
              const session = await connectionManager.getTabSelectedSession();
              if (session) {
                await connectionManager.updateSessionRole(session.username, session.serverAddress, payload.role);
              }
            })().catch(console.error);
          }
          return {
            ...prev,
            currentUser: updatedCurrentUser,
            lastRequestId: payload.connection.request_id
          };
        });
      });

      // User permissions loaded event - updates currentUser's role
      await workspaceEvents.onMemberEvent('user:permissions:loaded', (payload: { userId: string; role: string; connection?: ConnectionInfo }) => {
        console.info('User permissions loaded:', payload.userId, payload.role);
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
            console.info(`Updating current user role from permissions to: ${payload.role}`);
            updatedCurrentUser = {
              ...prev.currentUser,
              // Also update username if it was 'Loading...'
              username: prev.currentUser.username === 'Loading...' ? payload.userId : prev.currentUser.username,
              id: prev.currentUser.id === 'Loading...' ? payload.userId : prev.currentUser.id,
              role: payload.role
            };

            // Persist role to stored session for WorkspaceSwitcher (async)
            (async () => {
              const session = await connectionManager.getTabSelectedSession();
              if (session) {
                await connectionManager.updateSessionRole(session.username, session.serverAddress, payload.role);
              }
            })().catch(console.error);
          }
          return {
            ...prev,
            currentUser: updatedCurrentUser,
            lastRequestId: payload.connection?.request_id
          };
        });
      });

      // Member removed event
      await workspaceEvents.onMemberEvent('member:removed', (payload: { userId: string; connection: ConnectionInfo }) => {
        console.info('Member removed:', payload.userId);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      // Members reload event
      await workspaceEvents.onWorkspaceEvent('members:reload', async () => {
        console.info('Reloading members list...');
        // Backend requires exactly ONE of office_id or room_id (room takes precedence)
        const params = new URLSearchParams(window.location.search);
        const officeId = params.get("officeId");
        const roomId = params.get("roomId");
        if (roomId) {
          await WorkspaceService.listMembers(undefined, roomId);
        } else if (officeId) {
          await WorkspaceService.listMembers(officeId, undefined);
        }
      });
    };

    (async () => {
      await setupMemberListeners();
    })().catch(console.error);
  }, [setState]);
}
