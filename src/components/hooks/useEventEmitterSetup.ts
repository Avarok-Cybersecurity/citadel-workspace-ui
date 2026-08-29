/**
 * useEventEmitterSetup Hook
 *
 * Sets up eventEmitter-based listeners for broadcast state sync and user profile updates.
 * Extracted from WorkspaceEventHandler.tsx to reduce file size.
 */

import { useEffect } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';
import type { DomainNode } from '@/components/layout/sidebar/TreeNodesSection';
import { debugLog } from '@/lib/debug-config';

interface UseEventEmitterSetupProps {
  setState: React.Dispatch<React.SetStateAction<WorkspaceEventState>>;
}

export function useEventEmitterSetup({ setState }: UseEventEmitterSetupProps): void {
  useEffect(() => {
    // Setup user profile update listener
    const userProfileHandler = (data: { user: { name?: string; metadata?: { avatar?: { content?: string; String?: string } | string } }; connection: unknown }): void => {
      debugLog('UseEventEmitterSetup', 'WorkspaceEventHandler: Received user profile update', data);

      const user: { name?: string; metadata?: { avatar?: { content?: string; String?: string; } | string; }; } = data.user;
      let avatarUrl: string | undefined;
      if (user.metadata?.avatar) {
        const avatar: string | { content?: string; String?: string; } = user.metadata.avatar;
        const avatarData: string | undefined = typeof avatar === 'string'
          ? avatar
          : avatar?.content || avatar?.String;
        if (avatarData) {
          avatarUrl = avatarData.startsWith('data:')
            ? avatarData
            : `data:image/webp;base64,${avatarData}`;
        }
      }

      setState(prev => ({
        ...prev,
        currentUser: prev.currentUser ? {
          ...prev.currentUser,
          displayName: user.name || prev.currentUser.displayName,
          name: user.name || prev.currentUser.name,
          avatarUrl: avatarUrl || prev.currentUser.avatarUrl
        } : prev.currentUser
      }));
    };

    // Broadcast state sync handler
    const broadcastSyncHandler = (data: { type: string; data: unknown }): void => {
      debugLog('UseEventEmitterSetup', 'WorkspaceEventHandler: Received broadcast state sync', data);

      if (data.type === 'workspace') {
        const { currentUser: _receivedUser, ...receivedData } = data.data as { currentUser?: unknown };
        setState(prev => ({
          ...prev,
          ...receivedData,
          currentUser: prev.currentUser
        }));
      } else if (data.type === 'nodes') {
        setState(prev => ({
          ...prev,
          nodes: data.data as Record<string, DomainNode>
        }));
      } else if (data.type === 'members') {
        setState(prev => ({
          ...prev,
          members: data.data as unknown
        } as WorkspaceEventState));
      }
    };

    // Register event listeners
    eventEmitter.on('user:profile-updated', userProfileHandler);
    eventEmitter.on('broadcast-state-sync', broadcastSyncHandler);

    // Cleanup
    return (): void => {
      eventEmitter.off('user:profile-updated', userProfileHandler);
      eventEmitter.off('broadcast-state-sync', broadcastSyncHandler);
    };
  }, [setState]);
}
