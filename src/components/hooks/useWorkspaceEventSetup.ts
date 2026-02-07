import { useEffect } from 'react';
import { workspaceEvents, type ConnectionInfo, type WorkspacesPayload } from '@/lib/workspace-events';
import { broadcastChannelService } from '@/lib/broadcast-channel-service';
import { connectionManager } from '@/lib/connection';
import UserService from '@/lib/user-service';
import WorkspaceService from '@/lib/workspace-service';
import { bytesToString } from '@/lib/utils/encoding-utils';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';
import { setLoading, runAsyncSetup } from './event-setup-utils';

interface UseWorkspaceEventSetupProps {
  setState: React.Dispatch<React.SetStateAction<WorkspaceEventState>>;
}

export function useWorkspaceEventSetup({ setState }: UseWorkspaceEventSetupProps): void {
  useEffect(() => {
    const setupWorkspaceListeners = async () => {
      // Loading state
      await workspaceEvents.onWorkspaceEvent('workspace:loading', (connectionInfo: ConnectionInfo) => {
        setLoading(setState, 'workspace', true, connectionInfo.request_id);
      });

      // Workspace loaded event
      await workspaceEvents.onWorkspaceEvent('workspace:loaded', async (payload) => {
        const rawMetadata = payload.workspace.metadata;

        // Parse metadata as JSON to check initialization status
        let isInitialized = false;
        let parsedMetadata: Record<string, unknown> | undefined;
        try {
          if (rawMetadata && typeof rawMetadata === 'object') {
            if (Array.isArray(rawMetadata) && rawMetadata.length > 0) {
              const metadataString = bytesToString(rawMetadata as number[]);
              parsedMetadata = JSON.parse(metadataString);
              isInitialized = parsedMetadata?.initialized === true;
            } else if (!Array.isArray(rawMetadata)) {
              parsedMetadata = rawMetadata;
              isInitialized = parsedMetadata?.initialized === true;
            }
          }
        } catch (error) {
          console.warn('Failed to parse workspace metadata as JSON:', error);
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
          lastRequestId: payload.connection.request_id
        }));

        // Broadcast workspace state to other tabs
        broadcastChannelService.broadcastStateSync({
          type: 'workspace',
          data: {
            workspace: { id: payload.workspace.id, name: payload.workspace.name, metadata: parsedMetadata },
            loading: { workspace: false },
            needsWorkspaceInitialization: !isInitialized,
            lastRequestId: payload.connection.request_id
          }
        });

        // Try to load user information if not already loaded
        const userService = UserService;
        const currentUser = await userService.getCurrentUser();

        if (currentUser) {
          const storedSession = await connectionManager.getTabSelectedSession();
          const role = storedSession?.role;

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

        // Fetch workspace list now that connection is active
        await WorkspaceService.listWorkspaces().catch((err: unknown) => {
          console.warn('[WorkspaceEventSetup] Failed to list workspaces:', err);
        });
      });

      // Workspaces listed event
      await workspaceEvents.onWorkspaceEvent('workspaces:listed', (payload: WorkspacesPayload) => {
        setState(prev => ({
          ...prev,
          workspaces: payload.workspaces,
        }));
      });

      // Workspace not initialized event
      await workspaceEvents.onWorkspaceEvent('workspace:not-initialized', () => {
        setState(prev => ({
          ...prev,
          needsWorkspaceInitialization: true,
          loading: { ...prev.loading, workspace: false }
        }));
      });
    };

    runAsyncSetup(setupWorkspaceListeners);
  }, [setState]);
}
