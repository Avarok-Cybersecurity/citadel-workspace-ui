import { useEffect } from 'react';
import { workspaceEvents, type RoomPayload, type ConnectionInfo } from '@/lib/workspace-events';
import { broadcastChannelService } from '@/lib/broadcast-channel-service';
import WorkspaceService from '@/lib/workspace-service';
import type { Room } from '@/types/workspace-entities';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';
import { setLoading, trackRequest, upsertEntity, removeEntity, runAsyncSetup } from './event-setup-utils';

interface UseRoomEventSetupProps {
  setState: React.Dispatch<React.SetStateAction<WorkspaceEventState>>;
}

export function useRoomEventSetup({ setState }: UseRoomEventSetupProps): void {
  useEffect(() => {
    const setupRoomListeners = async () => {
      // Loading states
      await workspaceEvents.onRoomEvent('rooms:loading', (payload) => {
        setLoading(setState, 'rooms', true, payload.connection.request_id);
        console.info(`Loading rooms for office: ${payload.office_id}, request ID: ${payload.connection.request_id}`);
      });

      await workspaceEvents.onRoomEvent('room:loading', (payload) => {
        console.info(`Loading room: ${payload.room_id}, request ID: ${payload.connection.request_id}`);
        trackRequest(setState, payload.connection.request_id);
      });

      // Data loaded events
      await workspaceEvents.onRoomEvent('rooms:loaded', (payload) => {
        const roomsMap: Record<string, Room> = {};
        payload.rooms.forEach(room => {
          roomsMap[room.id] = room;
        });

        setState(prev => {
          const newRooms = { ...prev.rooms, ...roomsMap };

          // Broadcast rooms state to other tabs
          broadcastChannelService.broadcastStateSync({
            type: 'rooms',
            data: newRooms
          });

          return {
            ...prev,
            rooms: newRooms,
            loading: { ...prev.loading, rooms: false },
            lastRequestId: payload.connection.request_id
          };
        });
      });

      await workspaceEvents.onRoomEvent('room:loaded', (payload: RoomPayload) => {
        upsertEntity(setState, 'rooms', payload.room, payload.connection.request_id);
      });

      // Creation and update events
      await workspaceEvents.onRoomEvent('room:creating', (payload) => {
        console.info(`Creating new room in office: ${payload.office_id}, request ID: ${payload.connection.request_id}`);
        trackRequest(setState, payload.connection.request_id);
      });

      await workspaceEvents.onRoomEvent('room:updating', (payload) => {
        console.info(`Updating room: ${payload.room_id}, request ID: ${payload.connection.request_id}`);
        trackRequest(setState, payload.connection.request_id);
      });

      await workspaceEvents.onRoomEvent('room:deleting', (payload) => {
        console.info(`Deleting room: ${payload.room_id}, request ID: ${payload.connection.request_id}`);
        removeEntity(setState, 'rooms', payload.room_id, payload.connection.request_id);
      });

      // Room created event
      await workspaceEvents.onRoomEvent('room:created', (payload: { room: Room; connection: ConnectionInfo }) => {
        console.info('Room created:', payload.room);
        upsertEntity(setState, 'rooms', payload.room, payload.connection.request_id);
      });

      // Room updated event
      await workspaceEvents.onRoomEvent('room:updated', (payload: { room: Room; connection: ConnectionInfo }) => {
        console.info('Room updated:', payload.room);
        upsertEntity(setState, 'rooms', payload.room, payload.connection.request_id);
      });

      // Room deleted event
      await workspaceEvents.onRoomEvent('room:deleted', (payload: { roomId: string; connection: ConnectionInfo }) => {
        console.info('Room deleted:', payload.roomId);
        removeEntity(setState, 'rooms', payload.roomId, payload.connection.request_id);
      });

      // Rooms reload event
      await workspaceEvents.onWorkspaceEvent('rooms:reload', async (payload: { office_id?: string }) => {
        console.info('Reloading rooms list...');
        if (payload && payload.office_id) {
          await WorkspaceService.listRooms(payload.office_id);
        }
      });
    };

    runAsyncSetup(setupRoomListeners);
  }, [setState]);
}
