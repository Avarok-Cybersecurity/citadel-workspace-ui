/**
 * useOfficeEventSetup Hook
 *
 * Sets up office-level event listeners for loading, loaded, creating, updating, deleting events.
 * Extracted from WorkspaceEventHandler.tsx to reduce file size.
 */

import { useEffect } from 'react';
import { workspaceEvents, type ConnectionInfo, type OfficePayload } from '@/lib/workspace-events';
import { broadcastChannelService } from '@/lib/broadcast-channel-service';
import WorkspaceService from '@/lib/workspace-service';
import type { Office } from '@/types/workspace-entities';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';

interface UseOfficeEventSetupProps {
  setState: React.Dispatch<React.SetStateAction<WorkspaceEventState>>;
}

export function useOfficeEventSetup({ setState }: UseOfficeEventSetupProps): void {
  useEffect(() => {
    const setupOfficeListeners = async () => {
      // Loading states
      await workspaceEvents.onOfficeEvent('offices:loading', (connectionInfo: ConnectionInfo) => {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, offices: true },
          lastRequestId: connectionInfo.request_id
        }));
      });

      await workspaceEvents.onOfficeEvent('office:loading', (payload) => {
        console.info(`Loading office: ${payload.office_id}, request ID: ${payload.connection.request_id}`);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      // Data loaded events
      await workspaceEvents.onOfficeEvent('offices:loaded', (payload) => {
        const officesMap: Record<string, Office> = {};
        payload.offices.forEach(office => {
          officesMap[office.id] = office;
        });

        setState(prev => ({
          ...prev,
          offices: officesMap,
          loading: { ...prev.loading, offices: false },
          lastRequestId: payload.connection.request_id
        }));

        // Broadcast offices state to other tabs
        broadcastChannelService.broadcastStateSync({
          type: 'offices',
          data: officesMap
        });

        // After offices are loaded, load rooms for each office
        if (payload.offices.length > 0) {
          console.info(`Loading rooms for ${payload.offices.length} offices`);
          payload.offices.forEach(office => {
            WorkspaceService.listRooms(office.id)
              .then(() => {
                console.info(`Rooms loading initiated for office: ${office.id}`);
              })
              .catch(error => {
                console.error(`Error loading rooms for office ${office.id}:`, error);
              });
          });
        }
      });

      await workspaceEvents.onOfficeEvent('office:loaded', (payload: OfficePayload) => {
        setState(prev => ({
          ...prev,
          offices: {
            ...prev.offices,
            [payload.office.id]: payload.office
          },
          lastRequestId: payload.connection.request_id
        }));
      });

      // Creation and update events
      await workspaceEvents.onOfficeEvent('office:creating', (connectionInfo: ConnectionInfo) => {
        console.info('Creating new office...', connectionInfo.request_id);
        setState(prev => ({
          ...prev,
          lastRequestId: connectionInfo.request_id
        }));
      });

      await workspaceEvents.onOfficeEvent('office:updating', (payload) => {
        console.info(`Updating office: ${payload.office_id}, request ID: ${payload.connection.request_id}`);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      await workspaceEvents.onOfficeEvent('office:deleting', (payload) => {
        console.info(`Deleting office: ${payload.office_id}, request ID: ${payload.connection.request_id}`);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      // Office created event
      await workspaceEvents.onOfficeEvent('office:created', (payload: { office: Office; connection: ConnectionInfo }) => {
        console.info('Office created:', payload.office);
        setState(prev => ({
          ...prev,
          offices: {
            ...prev.offices,
            [payload.office.id]: payload.office
          },
          lastRequestId: payload.connection.request_id
        }));
      });

      // Office updated event
      await workspaceEvents.onOfficeEvent('office:updated', (payload: { office: Office; connection: ConnectionInfo }) => {
        console.info('Office updated:', payload.office);
        setState(prev => ({
          ...prev,
          offices: {
            ...prev.offices,
            [payload.office.id]: payload.office
          },
          lastRequestId: payload.connection.request_id
        }));
      });

      // Office deleted event
      await workspaceEvents.onOfficeEvent('office:deleted', (payload: { officeId: string; connection: ConnectionInfo }) => {
        console.info('Office deleted:', payload.officeId);
        setState(prev => {
          const newOffices = { ...prev.offices };
          delete newOffices[payload.officeId];

          // Also remove all rooms belonging to this office
          const newRooms = { ...prev.rooms };
          Object.keys(newRooms).forEach(roomId => {
            if (newRooms[roomId].officeId === payload.officeId) {
              delete newRooms[roomId];
            }
          });

          return {
            ...prev,
            offices: newOffices,
            rooms: newRooms,
            lastRequestId: payload.connection.request_id
          };
        });
      });

      // Offices reload event
      await workspaceEvents.onWorkspaceEvent('offices:reload', async () => {
        console.info('Reloading offices list...');
        await WorkspaceService.listOffices();
      });
    };

    (async () => {
      await setupOfficeListeners();
    })().catch(console.error);
  }, [setState]);
}
