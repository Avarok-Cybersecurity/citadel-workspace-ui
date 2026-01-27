/**
 * useWorkspaceEventSetup Hook
 *
 * Sets up workspace-level event listeners for loading, loaded, and not-initialized events.
 * Extracted from WorkspaceEventHandler.tsx to reduce file size.
 */

import { useEffect } from 'react';
import { workspaceEvents, type ConnectionInfo } from '@/lib/workspace-events';
import { broadcastChannelService } from '@/lib/broadcast-channel-service';
import { connectionManager } from '@/lib/connection';
import UserService from '@/lib/user-service';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';

interface UseWorkspaceEventSetupProps {
  setState: React.Dispatch<React.SetStateAction<WorkspaceEventState>>;
}

export function useWorkspaceEventSetup({ setState }: UseWorkspaceEventSetupProps): void {
  useEffect(() => {
    const setupWorkspaceListeners = async () => {
      // Loading state
      await workspaceEvents.onWorkspaceEvent('workspace:loading', (connectionInfo: ConnectionInfo) => {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, workspace: true },
          lastRequestId: connectionInfo.request_id
        }));
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
              const metadataString = new TextDecoder().decode(new Uint8Array(rawMetadata as number[]));
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

    (async () => {
      await setupWorkspaceListeners();
    })().catch(console.error);
  }, [setState]);
}
