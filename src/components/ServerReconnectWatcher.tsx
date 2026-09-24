import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router';
import { eventEmitter } from '@/lib/event-emitter';
import { useToast } from '@/hooks/use-toast';
import { getSelectedUser, type TabUserContext } from '@/lib/tab-context';
import { p2pAutoConnectService } from '@/lib/p2p-auto-connect-service';
import { readAgentReconnectEvent, type AgentReconnectEvent } from '@/types/agent-reconnect';
import {
  handleServerReconnectEvent,
  reconnectingTo,
  type OwnSession,
  type ServerReconnectIO,
} from '@/lib/reconnect/server-reconnect';
import { debugLog } from '@/lib/debug-config';

/**
 * Connects the agent's server-link notifications to this tab (server-reconnect.ts).
 * Inside the router, because giving up sends the user to sign in.
 */
export function ServerReconnectWatcher(): null {
  const navigate: NavigateFunction = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const io: ServerReconnectIO = {
      ownSession: async (): Promise<OwnSession | null> => {
        const tab: TabUserContext | null = await getSelectedUser();
        if (!tab?.selectedCid || !tab.selectedUsername || !tab.selectedServerAddress) return null;
        return { cid: tab.selectedCid, username: tab.selectedUsername, server: tab.selectedServerAddress };
      },
      setReconnecting: reconnectingTo.set,
      resumePeers: async (): Promise<void> => {
        // The drop took every P2P link with it; the reset forgets them and puts
        // this side in initiator mode, as the startup path does after a claim.
        await p2pAutoConnectService.resetConnectionState();
        await p2pAutoConnectService.connectToAllRegisteredPeers();
      },
      signInAgain: (path: string, message: string): void => {
        toast({ title: 'Signed out', description: message, variant: 'destructive' });
        navigate(path);
      },
    };

    // One at a time and in arrival order: each first awaits this tab's session,
    // so a "reconnected" handled before its "lost" would leave the banner up.
    let queue: Promise<void> = Promise.resolve();
    const onMessage = (message: unknown): void => {
      const event: AgentReconnectEvent | null = readAgentReconnectEvent(message);
      if (!event) return;
      queue = queue
        .then(() => handleServerReconnectEvent(event, io))
        .catch((error: unknown): void => { debugLog('ServerReconnect', `Handling ${event.kind} failed`, error); });
    };
    eventEmitter.on('websocket-message', onMessage);
    return (): void => {
      eventEmitter.off('websocket-message', onMessage);
      reconnectingTo.set(null);
    };
  }, [navigate, toast]);

  return null;
}
