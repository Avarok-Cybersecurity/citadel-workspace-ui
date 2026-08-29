/**
 * useRegisteredPeers Hook
 *
 * Manages registered P2P peer state including loading, merging cache/backend data,
 * status tracking, and stale conversation cleanup.
 */

import { isPlaceholderName, peerDisplayName } from '@/lib/peer-display';
import { useState, useEffect, useRef, useCallback , type MutableRefObject } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import { p2pRegistrationService } from '@/lib/p2p-registration-service';
import { p2pAutoConnectService } from '@/lib/p2p-auto-connect-service';
import { sessionStartupService } from '@/lib/session-startup-service';
import { P2PMessengerManager } from '@/lib/p2p';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

export interface RegisteredPeer {
  cid: string;
  username: string;
  /** True, false, or null when no poll has landed. See lib/presence.ts. */
  isOnline: boolean | null;
  isConnected: boolean;
}

interface UseRegisteredPeersReturn {
  registeredPeers: RegisteredPeer[];
  isLoading: boolean;
  refreshPeers: () => Promise<void>;
}

export function useRegisteredPeers(): UseRegisteredPeersReturn {
  const [registeredPeers, setRegisteredPeers] = useState<RegisteredPeer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [startupComplete, setStartupComplete] = useState(true);
  const startupCompleteRef: MutableRefObject<boolean> = useRef(startupComplete);

  useEffect(() => {
    startupCompleteRef.current = startupComplete;
  }, [startupComplete]);

  const loadRegisteredPeers: () => Promise<void> = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const { registeredPeers: cachedPeers } = p2pRegistrationService.getPeers();

      let freshPeers: Array<{ cid?: bigint; username?: string }> = [];
      try {
        // Retrying variant, not the single-shot one. ListRegisteredPeers times out
        // intermittently under concurrent P2P activity; with a single attempt this
        // hook silently fell back to the cache, which is why a freshly-registered
        // peer could take a poll cycle (or several) to appear in the sidebar.
        freshPeers = await p2pRegistrationService.listRegisteredPeersWithRetry();
      } catch (e: unknown) {
        const errorMessage: string = e instanceof Error ? e.message : String(e);
        debugLog('UseRegisteredPeers', `listRegisteredPeers failed after retries (${errorMessage}), using cached peers`);
      }

      // Merge cached and fresh peers
      const mergedPeersMap: Map<string, { cid?: bigint; username?: string; }> = new Map<string, { cid?: bigint; username?: string }>();

      for (const p of cachedPeers) {
        const cidStr: string = p.cid?.toString() || '';
        if (cidStr) mergedPeersMap.set(cidStr, p);
      }

      for (const p of freshPeers) {
        const cidStr: string = p.cid?.toString() || '';
        if (cidStr) {
          const existing: { cid?: bigint; username?: string; } | undefined = mergedPeersMap.get(cidStr);
          if (existing) {
            const mergedPeer: { username: string | undefined; cid?: bigint; } = {
              ...p,
              username: isPlaceholderName(existing.username) ? p.username : existing.username
            };
            mergedPeersMap.set(cidStr, mergedPeer);
          } else {
            mergedPeersMap.set(cidStr, p);
          }
        }
      }

      const peersToUse: { cid?: bigint; username?: string; }[] = Array.from(mergedPeersMap.values());

      let peerList: RegisteredPeer[] = [];
      try {
        peerList = await Promise.all(peersToUse.map(async p => {
          const cidStr: string = p.cid?.toString() || '';
          const displayName: string = peerDisplayName({ cid: p.cid, username: p.username });
          const peerCidBigInt: bigint = p.cid ?? BigInt(0);
          const isOnline: boolean | null = p2pAutoConnectService.peerOnlineStatus(peerCidBigInt);
          let isConnected: boolean = false;
          try {
            const connectedPromise: Promise<boolean> = p2pAutoConnectService.isPeerConnected(peerCidBigInt);
            const timeoutPromise: Promise<boolean> = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000));
            isConnected = await Promise.race([connectedPromise, timeoutPromise]);
          } catch {
            isConnected = false;
          }
          return { cid: cidStr, username: displayName, isOnline, isConnected };
        }));
      } catch (mapError) {
        debugLog('UseRegisteredPeers', 'Promise.all mapping failed:', mapError);
        peerList = peersToUse.map(p => {
          const cidStr: string = p.cid?.toString() || '';
          const displayName: string = peerDisplayName({ cid: p.cid, username: p.username });
          // The listing failed; nobody has said whether these peers are online.
          return { cid: cidStr, username: displayName, isOnline: null, isConnected: false };
        });
      }

      setRegisteredPeers(peerList);

      // Clean up stale conversations
      const isStartupInProgress: boolean = sessionStartupService.isStartupInProgress();
      if (startupCompleteRef.current && !isStartupInProgress) {
        const validPeerCids: Set<bigint> = new Set(peerList.filter(p => p.cid).map(p => BigInt(p.cid)));
        const connectedPeerCids: bigint[] = await p2pAutoConnectService.getConnectedPeers();
        for (const cid of connectedPeerCids) {
          validPeerCids.add(cid);
        }

        const messenger: P2PMessengerManager = P2PMessengerManager.getInstance();
        const cleanedCount: number = await messenger.cleanupStaleConversations(validPeerCids);
        if (cleanedCount > 0) {
          debugLog('UseRegisteredPeers', `[P2P] useRegisteredPeers: Cleaned up ${cleanedCount} stale conversation(s)`);
        }
      }
    } catch (error) {
      debugLog('UseRegisteredPeers', 'Failed to load peers:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Track session startup state
  useEffect(() => {
    const handleSessionActivated = (event: { activationType: string }): void => {
      if (event.activationType === 'login' || event.activationType === 'claim') {
        setStartupComplete(false);
      }
    };
    const handleStartupComplete = (): void => setStartupComplete(true);

    eventEmitter.on('session:activated', handleSessionActivated);
    eventEmitter.on('session:startup-complete', handleStartupComplete);

    return (): void => {
      eventEmitter.off('session:activated', handleSessionActivated);
      eventEmitter.off('session:startup-complete', handleStartupComplete);
    };
  }, []);

  // Initial load and event listeners
  useEffect(() => {
    runAsyncSetup(loadRegisteredPeers);

    const handlePeerUpdate = async (): Promise<void> => { await loadRegisteredPeers(); };

    eventEmitter.on('p2p:peer-registered', handlePeerUpdate);
    eventEmitter.on('p2p:registration-accepted', handlePeerUpdate);
    eventEmitter.on('p2p:peers-updated', handlePeerUpdate);
    eventEmitter.on('p2p-connection-established', handlePeerUpdate);
    eventEmitter.on('p2p-connection-lost', handlePeerUpdate);
    eventEmitter.on('session:startup-complete', handlePeerUpdate);

    return (): void => {
      eventEmitter.off('p2p:peer-registered', handlePeerUpdate);
      eventEmitter.off('p2p:registration-accepted', handlePeerUpdate);
      eventEmitter.off('p2p:peers-updated', handlePeerUpdate);
      eventEmitter.off('p2p-connection-established', handlePeerUpdate);
      eventEmitter.off('p2p-connection-lost', handlePeerUpdate);
      eventEmitter.off('session:startup-complete', handlePeerUpdate);
    };
  }, [loadRegisteredPeers]);

  return {
    registeredPeers,
    isLoading,
    refreshPeers: loadRegisteredPeers,
  };
}
