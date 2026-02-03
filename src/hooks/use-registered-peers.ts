/**
 * useRegisteredPeers Hook
 *
 * Manages registered P2P peer state including loading, merging cache/backend data,
 * status tracking, and stale conversation cleanup.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import { p2pRegistrationService } from '@/lib/p2p-registration-service';
import { p2pAutoConnectService } from '@/lib/p2p-auto-connect-service';
import { sessionStartupService } from '@/lib/session-startup-service';
import { P2PMessengerManager } from '@/lib/p2p';

export interface RegisteredPeer {
  cid: string;
  username: string;
  isOnline: boolean;
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
  const startupCompleteRef = useRef(startupComplete);

  useEffect(() => {
    startupCompleteRef.current = startupComplete;
  }, [startupComplete]);

  const loadRegisteredPeers = useCallback(async () => {
    setIsLoading(true);
    try {
      const { registeredPeers: cachedPeers } = p2pRegistrationService.getPeers();

      let freshPeers: Array<{ cid?: bigint; username?: string }> = [];
      try {
        freshPeers = await p2pRegistrationService.listRegisteredPeers();
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.warn(`[P2P] useRegisteredPeers: listRegisteredPeers failed (${errorMessage}), using cached peers`);
      }

      // Merge cached and fresh peers
      const mergedPeersMap = new Map<string, { cid?: bigint; username?: string }>();

      for (const p of cachedPeers) {
        const cidStr = p.cid?.toString() || '';
        if (cidStr) mergedPeersMap.set(cidStr, p);
      }

      for (const p of freshPeers) {
        const cidStr = p.cid?.toString() || '';
        if (cidStr) {
          const existing = mergedPeersMap.get(cidStr);
          if (existing) {
            const mergedPeer = {
              ...p,
              username: (existing.username && existing.username !== 'Unknown' && !existing.username.startsWith('User '))
                ? existing.username
                : p.username
            };
            mergedPeersMap.set(cidStr, mergedPeer);
          } else {
            mergedPeersMap.set(cidStr, p);
          }
        }
      }

      const peersToUse = Array.from(mergedPeersMap.values());

      let peerList: RegisteredPeer[] = [];
      try {
        peerList = await Promise.all(peersToUse.map(async p => {
          const cidStr = p.cid?.toString() || '';
          const displayName = (p.username && p.username !== 'Unknown')
            ? p.username
            : (cidStr ? `Peer ${cidStr.slice(-6)}` : 'Unknown Peer');
          const peerCidBigInt = p.cid ?? BigInt(0);
          const isOnline = p2pAutoConnectService.isPeerOnline(peerCidBigInt);
          let isConnected = false;
          try {
            const connectedPromise = p2pAutoConnectService.isPeerConnected(peerCidBigInt);
            const timeoutPromise = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000));
            isConnected = await Promise.race([connectedPromise, timeoutPromise]);
          } catch {
            isConnected = false;
          }
          return { cid: cidStr, username: displayName, isOnline, isConnected };
        }));
      } catch (mapError) {
        console.error(`[P2P] useRegisteredPeers: Promise.all mapping failed:`, mapError);
        peerList = peersToUse.map(p => {
          const cidStr = p.cid?.toString() || '';
          const displayName = (p.username && p.username !== 'Unknown')
            ? p.username
            : (cidStr ? `Peer ${cidStr.slice(-6)}` : 'Unknown Peer');
          return { cid: cidStr, username: displayName, isOnline: false, isConnected: false };
        });
      }

      setRegisteredPeers(peerList);

      // Clean up stale conversations
      const isStartupInProgress = sessionStartupService.isStartupInProgress();
      if (startupCompleteRef.current && !isStartupInProgress) {
        const validPeerCids = new Set(peerList.filter(p => p.cid).map(p => BigInt(p.cid)));
        const connectedPeerCids = await p2pAutoConnectService.getConnectedPeers();
        for (const cid of connectedPeerCids) {
          validPeerCids.add(cid);
        }

        const messenger = P2PMessengerManager.getInstance();
        const cleanedCount = await messenger.cleanupStaleConversations(validPeerCids);
        if (cleanedCount > 0) {
          console.log(`[P2P] useRegisteredPeers: Cleaned up ${cleanedCount} stale conversation(s)`);
        }
      }
    } catch (error) {
      console.error('[P2P] useRegisteredPeers: Failed to load peers:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Track session startup state
  useEffect(() => {
    const handleSessionActivated = (event: { activationType: string }) => {
      if (event.activationType === 'login' || event.activationType === 'claim') {
        setStartupComplete(false);
      }
    };
    const handleStartupComplete = () => setStartupComplete(true);

    eventEmitter.on('session:activated', handleSessionActivated);
    eventEmitter.on('session:startup-complete', handleStartupComplete);

    return () => {
      eventEmitter.off('session:activated', handleSessionActivated);
      eventEmitter.off('session:startup-complete', handleStartupComplete);
    };
  }, []);

  // Initial load and event listeners
  useEffect(() => {
    (async () => { await loadRegisteredPeers(); })().catch(console.error);

    const handlePeerUpdate = async () => { await loadRegisteredPeers(); };

    eventEmitter.on('p2p:peer-registered', handlePeerUpdate);
    eventEmitter.on('p2p:registration-accepted', handlePeerUpdate);
    eventEmitter.on('p2p:peers-updated', handlePeerUpdate);
    eventEmitter.on('p2p-connection-established', handlePeerUpdate);
    eventEmitter.on('p2p-connection-lost', handlePeerUpdate);
    eventEmitter.on('session:startup-complete', handlePeerUpdate);

    return () => {
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
