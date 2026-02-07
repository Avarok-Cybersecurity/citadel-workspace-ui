/**
 * useEventEmitterSetup Hook
 *
 * Sets up eventEmitter-based listeners for broadcast state sync, user profile updates,
 * and content broadcast updates (office/room MDX content).
 * Extracted from WorkspaceEventHandler.tsx to reduce file size.
 */

import { useEffect } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';

interface UseEventEmitterSetupProps {
  setState: React.Dispatch<React.SetStateAction<WorkspaceEventState>>;
}

export function useEventEmitterSetup({ setState }: UseEventEmitterSetupProps): void {
  useEffect(() => {
    // Setup user profile update listener
    const userProfileHandler = (data: { user: { name?: string; metadata?: { avatar?: { content?: string; String?: string } | string } }; connection: unknown }) => {
      console.log('WorkspaceEventHandler: Received user profile update', data);

      const user = data.user;
      // Extract avatar from metadata if present
      // MetadataValue is a tagged enum: { type: "String", content: "..." }
      let avatarUrl: string | undefined;
      if (user.metadata?.avatar) {
        const avatar = user.metadata.avatar;
        // Handle tagged enum format: { type: "String", content: "data:..." }
        const avatarData = typeof avatar === 'string'
          ? avatar
          : avatar?.content || avatar?.String;
        if (avatarData) {
          // Convert base64 to data URL if not already
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

    // Office content update broadcast handler
    const officeContentHandler = (data: {
      officeId: string;
      mdxContent: string;
      updatedBy: string;
      timestamp: number;
      connection: unknown;
    }) => {
      console.log('WorkspaceEventHandler: Received office content update broadcast', {
        officeId: data.officeId,
        updatedBy: data.updatedBy,
        timestamp: data.timestamp
      });

      setState(prev => {
        const existingOffice = prev.offices[data.officeId];
        if (!existingOffice) {
          console.warn('Received content update for unknown office:', data.officeId);
          return prev;
        }

        return {
          ...prev,
          offices: {
            ...prev.offices,
            [data.officeId]: {
              ...existingOffice,
              mdx_content: data.mdxContent
            }
          }
        };
      });
    };

    // Room content update broadcast handler
    const roomContentHandler = (data: {
      roomId: string;
      officeId: string;
      mdxContent: string;
      updatedBy: string;
      timestamp: number;
      connection: unknown;
    }) => {
      console.log('WorkspaceEventHandler: Received room content update broadcast', {
        roomId: data.roomId,
        officeId: data.officeId,
        updatedBy: data.updatedBy,
        timestamp: data.timestamp
      });

      setState(prev => {
        const existingRoom = prev.rooms[data.roomId];
        if (!existingRoom) {
          console.warn('Received content update for unknown room:', data.roomId);
          return prev;
        }

        return {
          ...prev,
          rooms: {
            ...prev.rooms,
            [data.roomId]: {
              ...existingRoom,
              mdx_content: data.mdxContent
            }
          }
        };
      });
    };

    // Broadcast state sync handler
    const broadcastSyncHandler = (data: { type: string; data: unknown }) => {
      console.log('WorkspaceEventHandler: Received broadcast state sync', data);

      if (data.type === 'workspace') {
        // When receiving workspace state, preserve our tab's currentUser
        const { currentUser: _receivedUser, ...receivedData } = data.data as { currentUser?: unknown };
        setState(prev => ({
          ...prev,
          ...receivedData,
          // Keep our tab's currentUser
          currentUser: prev.currentUser
        }));
      } else if (data.type === 'offices') {
        setState(prev => ({
          ...prev,
          offices: data.data as WorkspaceEventState['offices']
        }));
      } else if (data.type === 'rooms') {
        setState(prev => ({
          ...prev,
          rooms: data.data as WorkspaceEventState['rooms']
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
    eventEmitter.on('office:content-updated', officeContentHandler);
    eventEmitter.on('room:content-updated', roomContentHandler);
    eventEmitter.on('broadcast-state-sync', broadcastSyncHandler);

    // Cleanup
    return () => {
      eventEmitter.off('user:profile-updated', userProfileHandler);
      eventEmitter.off('office:content-updated', officeContentHandler);
      eventEmitter.off('room:content-updated', roomContentHandler);
      eventEmitter.off('broadcast-state-sync', broadcastSyncHandler);
    };
  }, [setState]);
}
