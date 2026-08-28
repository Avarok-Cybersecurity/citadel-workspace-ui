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
import { healthCheckService } from '@/lib/health-check';
import { getSelectedUser } from '@/lib/tab-context';
import { TIMEOUT } from '@/lib/timeout-constants';
import { revfsService } from '@/lib/revfs';
import '@/lib/session-startup-service';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { postAuthSetup } from '@/lib/post-auth-setup';
import { debugLog } from '@/lib/debug-config';
import { makeSessionAlreadyConnectedHandler } from './session-already-connected';
import {
  NOT_FAILING, onFailure, onDismiss, onSuccess, isRetryDialogOpen,
  type RetryVisibility,
} from './connection-retry-visibility';

interface ConnectionHandlerState {
  /** See connection-retry-visibility: a dismissal survives repeated failures. */
  retry: RetryVisibility;
  connectionError: string | null;
  orphanSessionCid: string | null;
}

export function useConnectionHandler() {
  const [state, setState] = useState<ConnectionHandlerState>({
    retry: NOT_FAILING,
    connectionError: null,
    orphanSessionCid: null,
  });
  const { toast } = useToast();

  useEffect(() => {
    const initializeServices = async () => {
      try {
        debugLog('WorkspaceApp', 'Starting ConnectionManager initialization...');
        await connectionManager.initialize();
        debugLog('WorkspaceApp', 'ConnectionManager initialized successfully');
      } catch (error) {
        debugLog('WorkspaceApp', 'Failed to initialize ConnectionManager:', error);
      } finally {
        // After initialization, not before. The first probe is immediate, so
        // starting here sampled the service before it could possibly be up and
        // published "agent unreachable" to a banner that then sat there until
        // the next poll ten seconds later -- on every single boot, teaching
        // people to ignore the one banner that explains a real failure.
        //
        // In `finally` rather than after the await: an initialization that
        // FAILS is exactly when the banner needs to be right.
        healthCheckService.startHealthChecks(10000);
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
    const unsubscribeConnection = connectionService.onConnectionChange(async (connection) => {
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

        const allStoredSessions = connectionManager.getStoredSessionsArray();
        const storedSession = allStoredSessions.find(s => s.cid?.toString() === cidString);
        if (!storedSession) return;

        // Single source of truth for post-auth setup
        // (setConnectionId → loadWorkspace → listNodes → getTreeSchema).
        // Prior to this migration the hand-rolled chain skipped
        // `getTreeSchema()`, leaving this connection-change path
        // divergent from login / orphan-claim / workspace-switcher.
        // Errors surface as a notification so the rest of the
        // connection flow (event emission, welcome toast) still runs.
        try {
          await postAuthSetup(cidBigInt);
        } catch (error) {
          notificationService.addSystemNotification(
            'Workspace Error',
            `Could not load workspace data: ${error instanceof Error ? error.message : String(error)}`,
            NotificationPriority.HIGH,
            cidString
          );
        }

        eventEmitter.emit('session:activated', {
          cid: cidString,
          username: storedSession.username,
          serverAddress: storedSession.serverAddress,
          activationType: 'connect' as const
        });

        userService.loadUserRegistration(storedSession.serverAddress, connection.cid.toString())
          .catch(error => debugLog('WorkspaceApp', 'Error loading user registration info:', error));

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
      // Through the rule, not a bare `true`. The client retries while the agent
      // is down, so this fires every couple of seconds -- and setting `true`
      // here reopened the dialog within a second or two of every dismissal,
      // indefinitely. The user could not put it away.
      setState(prev => ({ ...prev, connectionError: event.error, retry: onFailure(prev.retry) }));
    };

    // A connection that succeeds ends the outage the dismissal was about, so
    // the NEXT failure interrupts again.
    const handleConnectionSuccess = () => {
      setState(prev => (prev.retry === NOT_FAILING ? prev : { ...prev, retry: onSuccess() }));
    };

    const handleSessionAlreadyConnected = makeSessionAlreadyConnectedHandler({ toast, setState });

    eventEmitter.on('connection-failure', handleConnectionFailure);
    eventEmitter.on('on-ws-connection-success', handleConnectionSuccess);
    eventEmitter.on('session-already-connected', handleSessionAlreadyConnected);

    return () => {
      // Drop this hook's own subscription explicitly. `connectionService.cleanup()`
      // below wipes the singleton's whole handler array — every other component's
      // subscription with it — which is only survivable because this hook mounts
      // above the router and unmounts last. Owning our own teardown means that
      // stops being load-bearing.
      unsubscribeConnection();
      messagingService.cleanup();
      connectionService.cleanup();
      WorkspaceService.cleanup();
      runAsyncSetup(() => userService.cleanup());
      healthCheckService.stopHealthChecks();
      eventEmitter.off('connection-failure', handleConnectionFailure);
      eventEmitter.off('on-ws-connection-success', handleConnectionSuccess);
      eventEmitter.off('session-already-connected', handleSessionAlreadyConnected);
    };
  }, [toast]);

  return {
    showConnectionRetry: isRetryDialogOpen(state.retry),
    connectionError: state.connectionError,
    orphanSessionCid: state.orphanSessionCid,
    setShowConnectionRetry: (v: boolean) =>
      setState(prev => ({ ...prev, retry: v ? onFailure(prev.retry) : onDismiss(prev.retry) })),
  };
}
