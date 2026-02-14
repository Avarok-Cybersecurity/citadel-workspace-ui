/**
 * useConnectionHandler Hook
 *
 * Manages the connection lifecycle for WorkspaceApp:
 * - Initializes ConnectionManager and health checks
 * - Handles connection change events (workspace loading, session activation)
 * - Handles WebSocket failures and session-already-connected errors
 * - Cleans up services on unmount
 */

import { useEffect, useState } from 'react';
import NotificationService, { NotificationPriority } from '@/lib/notification-service';
import { MessagingService } from '@/lib/messaging-service';
import { ConnectionService } from '@/lib/connection-service';
import WorkspaceService from '@/lib/workspace-service';
import UserService from '@/lib/user-service';
import { websocketService } from '@/lib/websocket-service';
import { connectionManager } from '@/lib/connection';
import { eventEmitter } from '@/lib/event-emitter';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { healthCheckService } from '@/lib/health-check';
import { getSelectedUser } from '@/lib/tab-context';
import { TIMEOUT } from '@/lib/timeout-constants';
import { revfsService } from '@/lib/revfs';
import '@/lib/session-startup-service';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import React from 'react';

interface ConnectionHandlerState {
  showConnectionRetry: boolean;
  connectionError: string | null;
  orphanSessionCid: string | null;
}

export function useConnectionHandler() {
  const [state, setState] = useState<ConnectionHandlerState>({
    showConnectionRetry: false,
    connectionError: null,
    orphanSessionCid: null,
  });
  const { toast } = useToast();

  useEffect(() => {
    const initializeServices = async () => {
      try {
        debugLog('WorkspaceApp', 'Starting ConnectionManager initialization...');
        healthCheckService.startHealthChecks(10000);
        await connectionManager.initialize();
        debugLog('WorkspaceApp', 'ConnectionManager initialized successfully');
      } catch (error) {
        debugLog('WorkspaceApp', 'Failed to initialize ConnectionManager:', error);
      }
    };

    runAsyncSetup(initializeServices);

    const notificationService = NotificationService.getInstance();
    const messagingService = MessagingService.getInstance();
    const connectionService = ConnectionService.getInstance();
    const userService = UserService;

    revfsService.initialize({
      sendP2PMessageReliable: (localCid, peerCid, message) =>
        websocketService.sendP2PMessageReliable(localCid, peerCid, message),
      getCurrentCid: async () => {
        const info = connectionManager.getConnectionInfo();
        return info?.cid ?? null;
      },
      sendInternalServiceRequest: (request: unknown) =>
        websocketService.sendMessage(request as Record<string, unknown>),
    });

    let lastProcessedCid: string | null = null;

    debugLog('WorkspaceApp', 'Subscribing to connection changes');
    connectionService.onConnectionChange(async (connection) => {
      debugLog('WorkspaceApp', `onConnectionChange called, cid=${connection?.cid?.toString()}, isConnected=${connection?.isConnected}`);
      const cidValue = typeof connection?.cid === 'string' ? parseInt(connection.cid, 10) : connection?.cid;
      if (connection && connection.cid && cidValue !== 0) {
        const cidString = connection.cid.toString();
        if (lastProcessedCid === cidString) {
          debugLog('WorkspaceApp', 'Skipping redundant connection update for CID:', cidString);
          return;
        }

        let tabSelection: { selectedCid?: string | bigint } | null = null;
        if (connection.userContext?.selectedCid) {
          tabSelection = { selectedCid: connection.userContext.selectedCid };
        } else {
          const maxRetries = 5;
          const retryDelayMs = 200;
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              const timeoutPromise = new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('getSelectedUser timeout')), TIMEOUT.GET_SELECTED_USER_MS)
              );
              tabSelection = await Promise.race([getSelectedUser(), timeoutPromise]);
              if (tabSelection?.selectedCid) break;
              if (attempt < maxRetries) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            } catch (e: unknown) {
              if (attempt < maxRetries) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
              else debugLog('WorkspaceApp', `getSelectedUser failed after all retries: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }

        if (!tabSelection?.selectedCid) return;
        if (tabSelection.selectedCid.toString() !== cidString) return;

        lastProcessedCid = cidString;
        const cidBigInt = typeof connection.cid === 'bigint' ? connection.cid : BigInt(connection.cid);
        WorkspaceService.setConnectionId(cidBigInt);

        const allStoredSessions = connectionManager.getStoredSessionsArray();
        const storedSession = allStoredSessions.find(s => s.cid?.toString() === cidString);
        if (!storedSession) return;

        eventEmitter.emit('session:activated', {
          cid: cidString,
          username: storedSession.username,
          serverAddress: storedSession.serverAddress,
          activationType: 'connect' as const
        });

        userService.loadUserRegistration(storedSession.serverAddress, connection.cid.toString())
          .catch(error => debugLog('WorkspaceApp', 'Error loading user registration info:', error));

        WorkspaceService.loadWorkspace()
          .then(() => WorkspaceService.listNodes())
          .catch((error) => {
            notificationService.addSystemNotification(
              'Workspace Error',
              `Could not load workspace data: ${error.message}`,
              NotificationPriority.HIGH,
              cidString
            );
          });

        setTimeout(() => {
          notificationService.addSystemNotification(
            'Welcome to Citadel Workspace',
            'Your secure workspace is ready. Explore the features and connect with your team.',
            NotificationPriority.NORMAL,
            cidString
          );
        }, 2000);
      }
    });

    const handleConnectionFailure = (event: { error: string }) => {
      setState(prev => ({ ...prev, connectionError: event.error, showConnectionRetry: true }));
    };

    const handleSessionAlreadyConnected = async (event: { cid: string; message: string }) => {
      debugLog('WorkspaceApp', 'Session already connected event:', event);
      toast({
        title: "Session Already Connected",
        description: "You are already connected in another window or tab.",
        variant: "destructive",
        action: React.createElement(ToastAction, {
          altText: "Try again",
          onClick: async () => {
            try {
              await websocketService.setOrphanMode(true);
              await websocketService.disconnectOrphan(null);
              toast({ title: "Orphaned sessions cleared", description: "Please try logging in again" });
            } catch (error) {
              debugLog('WorkspaceApp', 'Failed to disconnect orphan sessions:', error);
            }
          }
        }, "Clear Sessions") as React.ReactElement
      });
      setState(prev => ({ ...prev, showConnectionRetry: false }));
    };

    eventEmitter.on('connection-failure', handleConnectionFailure);
    eventEmitter.on('session-already-connected', handleSessionAlreadyConnected);

    return () => {
      messagingService.cleanup();
      connectionService.cleanup();
      WorkspaceService.cleanup();
      runAsyncSetup(() => userService.cleanup());
      healthCheckService.stopHealthChecks();
      eventEmitter.off('connection-failure', handleConnectionFailure);
      eventEmitter.off('session-already-connected', handleSessionAlreadyConnected);
    };
  }, [toast]);

  return {
    showConnectionRetry: state.showConnectionRetry,
    connectionError: state.connectionError,
    orphanSessionCid: state.orphanSessionCid,
    setShowConnectionRetry: (v: boolean) => setState(prev => ({ ...prev, showConnectionRetry: v })),
  };
}
