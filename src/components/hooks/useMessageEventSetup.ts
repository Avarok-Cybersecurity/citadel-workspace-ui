/**
 * useMessageEventSetup Hook
 *
 * Sets up event listeners for messages, typing indicators,
 * operation errors, and protocol warnings in WorkspaceEventHandler.
 */

import { useEffect } from 'react';
import { workspaceEvents, type ErrorPayload, type ConnectionInfo, type ProtocolWarningPayload, type MessagePayload } from '@/lib/workspace-events';
import { p2pRegistrationService } from '@/lib/p2p-registration-service';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';

interface UseMessageEventSetupOptions {
  setState: React.Dispatch<React.SetStateAction<WorkspaceEventState>>;
  setShowInitModal: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useMessageEventSetup({ setState, setShowInitModal }: UseMessageEventSetupOptions) {
  useEffect(() => {
    const setupMessageListeners = async () => {
      await workspaceEvents.onMessageEvent('message:received', (payload: MessagePayload) => {
        debugLog('WorkspaceEventHandler', `Received message from peer: ${payload.peerCid}, length: ${payload.contentLength}`);
        if (!payload.contents) return;
        const peerCidStr = (payload.peerCid ?? 0n).toString();

        setState(prev => {
          const peerMessages = prev.messages.byPeer[peerCidStr] || [];
          const updatedTypingPeerIds = prev.typing.peerIds.filter(id => id !== peerCidStr);
          return {
            ...prev,
            messages: {
              ...prev.messages,
              byPeer: {
                ...prev.messages.byPeer,
                [peerCidStr]: [...peerMessages, { content: payload.contents as string, timestamp: Date.now(), id: payload.connection.request_id }]
              },
              lastMessageTimestamp: Date.now()
            },
            typing: { ...prev.typing, peerIds: updatedTypingPeerIds, lastUpdated: Date.now() },
            lastRequestId: payload.connection.request_id
          };
        });
      });

      await workspaceEvents.onMessageEvent('typing:started', (payload: { peerCid: bigint, connection: ConnectionInfo }) => {
        const peerCidStr = payload.peerCid.toString();
        setState(prev => {
          if (!prev.typing.peerIds.includes(peerCidStr)) {
            return { ...prev, typing: { peerIds: [...prev.typing.peerIds, peerCidStr], lastUpdated: Date.now() }, lastRequestId: payload.connection.request_id };
          }
          return prev;
        });
      });

      await workspaceEvents.onMessageEvent('typing:stopped', (payload: { peerCid: bigint, connection: ConnectionInfo }) => {
        const peerCidStr = payload.peerCid.toString();
        setState(prev => ({
          ...prev,
          typing: { peerIds: prev.typing.peerIds.filter(id => id !== peerCidStr), lastUpdated: Date.now() },
          lastRequestId: payload.connection.request_id
        }));
      });
    };

    const setupErrorHandling = async () => {
      await workspaceEvents.onOperationEvent('operation:error', (payload: ErrorPayload) => {
        setState(prev => ({
          ...prev,
          error: payload.message,
          lastRequestId: payload.connection.request_id,
          needsWorkspaceInitialization: payload.message.includes('No workspace found')
        }));

        debugLog('WorkspaceEventHandler', 'Operation error:', payload.message);

        if (payload.message.includes('No workspace found')) {
          setShowInitModal(true);
        } else {
          setTimeout(() => { setState(prev => ({ ...prev, error: undefined })); }, 5000);
        }
      });

      await workspaceEvents.onOperationEvent('operation:success', (connectionInfo: ConnectionInfo) => {
        debugLog('WorkspaceEventHandler', `Operation successful (CID: ${connectionInfo.cid}, request ID: ${connectionInfo.request_id})`);
        setState(prev => ({ ...prev, lastRequestId: connectionInfo.request_id }));
      });
    };

    const setupProtocolWarningHandling = async () => {
      await workspaceEvents.onProtocolEvent('protocol:warning', (payload: ProtocolWarningPayload) => {
        debugLog('WorkspaceEventHandler', `Protocol warning: ${payload.message}`);
        setState(prev => ({
          ...prev,
          protocolWarning: { message: payload.message, requestType: payload.requestType, timestamp: Date.now() },
          lastRequestId: payload.connection.request_id
        }));
        setTimeout(() => { setState(prev => ({ ...prev, protocolWarning: undefined })); }, 10000);
      });
    };

    const initializeEvents = async () => {
      await setupMessageListeners();
      await setupErrorHandling();
      await setupProtocolWarningHandling();
      debugLog('WorkspaceEventHandler', 'Workspace event listeners initialized');
    };

    runAsyncSetup(initializeEvents);

    return () => {
      runAsyncSetup(async () => { workspaceEvents.cleanupAllListeners(); });
      p2pRegistrationService.stop();
    };
  }, [setState, setShowInitModal]);
}
