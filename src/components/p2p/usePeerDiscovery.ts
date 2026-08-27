import { useState, useEffect, useCallback, useRef } from 'react';
import { websocketService } from '@/lib/websocket-service';
import { connectionManager } from '@/lib/connection';
import { eventEmitter } from '@/lib/event-emitter';
import { useToast } from '@/hooks/use-toast';
import { toastSuccess, toastError } from '@/lib/toast-helpers';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { peerRegistrationStore, OutgoingPeerRequest, PendingPeerRequest } from '@/lib/peer-registration-store';
import { getSelectedUser } from '@/lib/tab-context';
import { broadcastChannelService } from '@/lib/broadcast-channel-service';
import { getDefaultSecuritySettings } from '@/lib/security-utils';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { narrowWebSocketMessage, hasVariant, getVariant } from '@/lib/ws-message-boundary';
import { discoverPeersViaGetSessions, fetchRegisteredPeers, fetchAllPeers } from './peer-discovery-requests';

export interface Peer {
  cid: string;
  username: string;
  fullName?: string;
  is_online: boolean;
  is_registered?: boolean;
}

export function usePeerDiscovery(isOpen: boolean) {
  const [peers, setPeers] = useState<Peer[]>([]);
  // requestId -> peer name, so a PeerRegisterFailure — which carries a
  // request_id but no peer_cid — can say who it was for.
  const sentRequests = useRef(new Map<string, string>());
  const [registeredPeers, setRegisteredPeers] = useState<Set<string>>(new Set());
  const [outgoingRequests, setOutgoingRequests] = useState<Set<string>>(new Set());
  const [incomingRequests, setIncomingRequests] = useState<Map<string, PendingPeerRequest>>(new Map());
  const [loading, setLoading] = useState(false);
  const [acceptingPeerCid, setAcceptingPeerCid] = useState<string | null>(null);
  const [currentCid, setCurrentCid] = useState<bigint | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string>('Unknown');
  const { toast } = useToast();
  const { state } = useWorkspace();

  // Load current connection info asynchronously
  useEffect(() => {
    const loadConnectionInfo = async () => {
      const tabSelection = await getSelectedUser();
      const tabSession = await connectionManager.getTabSelectedSession();
      const cid = tabSelection?.selectedCid || tabSession?.cid || connectionManager.getConnectionInfo()?.cid || null;
      const username = tabSelection?.selectedUsername || tabSession?.username || state.currentUser?.username || 'Unknown';
      setCurrentCid(cid);
      setCurrentUsername(username);
    };
    runAsyncSetup(loadConnectionInfo);
  }, [state.currentUser?.username]);

  // Listen for outgoing request updates
  useEffect(() => {
    const handleOutgoingUpdate = (data: { requests: OutgoingPeerRequest[]; cids: Set<bigint> }) => {
      const stringCids = new Set<string>();
      data.cids.forEach(cid => stringCids.add(cid.toString()));
      setOutgoingRequests(stringCids);
    };
    eventEmitter.on('outgoing-peer-requests:updated', handleOutgoingUpdate);
    return () => { eventEmitter.off('outgoing-peer-requests:updated', handleOutgoingUpdate); };
  }, []);

  // Listen for incoming pending requests
  useEffect(() => {
    const updateIncomingRequests = async () => {
      const pending = await peerRegistrationStore.getPendingRequests();
      const incomingMap = new Map<string, PendingPeerRequest>();
      pending.forEach(req => { incomingMap.set(req.peer_cid.toString(), req); });
      setIncomingRequests(incomingMap);
    };
    if (isOpen) { runAsyncSetup(updateIncomingRequests); }
    eventEmitter.on('peer-requests:updated', updateIncomingRequests);
    return () => { eventEmitter.off('peer-requests:updated', updateIncomingRequests); };
  }, [isOpen]);

  // Listen for PeerRegisterSuccess/PeerConnectSuccess
  useEffect(() => {
    const handleRegistrationSuccess = (raw: unknown) => {
      const message = narrowWebSocketMessage(raw);
      if (!message) return;
      // A refusal used to reach only `debugLog`, compiled out in production, so
      // the user was told "Request Sent" and then nothing. Correlated by
      // request_id: the failure carries no peer_cid.
      if (hasVariant(message, 'PeerRegisterFailure')) {
        const failure = getVariant(message, 'PeerRegisterFailure')!;
        const requestId = failure.request_id as string | undefined;
        const peerName = requestId ? sentRequests.current.get(requestId) : undefined;
        if (requestId && peerName) {
          sentRequests.current.delete(requestId);
          const reason = typeof failure.message === 'string' ? failure.message : undefined;
          toastError(
            toast,
            'Request Failed',
            reason
              ? `Your request to ${peerName} was not accepted: ${reason}`
              : `Your request to ${peerName} could not be delivered.`,
          );
        }
      }
      if (hasVariant(message, 'PeerRegisterSuccess')) {
        const peerCid = (getVariant(message, 'PeerRegisterSuccess')!.peer_cid as bigint | undefined)?.toString();
        if (peerCid) { setRegisteredPeers(prev => new Set([...prev, peerCid])); }
      }
      if (hasVariant(message, 'PeerConnectSuccess')) {
        const peerCid = (getVariant(message, 'PeerConnectSuccess')!.peer_cid as bigint | undefined)?.toString();
        if (peerCid) { setRegisteredPeers(prev => new Set([...prev, peerCid])); }
      }
    };
    eventEmitter.on('websocket-message', handleRegistrationSuccess);
    return () => { eventEmitter.off('websocket-message', handleRegistrationSuccess); };
    // `toast` is a stable module function (see hooks/use-toast), so this
    // re-subscribes on nothing.
  }, [toast]);

  // Listen for incoming registration notifications
  useEffect(() => {
    const handleIncomingRegistration = async (raw: unknown) => {
      const message = narrowWebSocketMessage(raw);
      if (!message) return;
      if (hasVariant(message, 'PeerRegisterNotification')) {
        await peerRegistrationStore.handleIncomingRequest(getVariant(message, 'PeerRegisterNotification') as { cid: bigint; peer_cid: bigint; peer_username?: string });
      }
    };
    eventEmitter.on('websocket-message', handleIncomingRegistration);
    return () => { eventEmitter.off('websocket-message', handleIncomingRegistration); };
  }, []);

  const loadRegisteredPeers = useCallback(async () => {
    if (!currentCid) return;
    try {
      const registered = await fetchRegisteredPeers(currentCid);
      setRegisteredPeers(registered);
    } catch (error) {
      debugLog('PeerDiscoveryModal', 'Failed to load registered peers:', error);
    }
  }, [currentCid]);

  const discoverPeers = useCallback(async () => {
    if (!currentCid) {
      toastError(toast, "Not Connected", "Please connect to a workspace first");
      return;
    }
    setLoading(true);
    try {
      const processedPeers = await fetchAllPeers(currentCid);
      setPeers(processedPeers);
      loadRegisteredPeers().catch(err => {
        debugLog('PeerDiscoveryModal', 'Could not load registered peers:', err);
      });

      if (processedPeers.length === 0) {
        debugLog('PeerDiscoveryModal', 'ListAllPeers returned empty, trying GetSessions fallback...');
        const sessionPeers = await discoverPeersViaGetSessions(currentCid);
        if (sessionPeers.length > 0) {
          setPeers(sessionPeers);
          loadRegisteredPeers().catch(err => { debugLog('PeerDiscoveryModal', 'Could not load registered peers:', err); });
          toastSuccess(toast, "Peers Discovered", `Found ${sessionPeers.length} other user${sessionPeers.length > 1 ? 's' : ''} via session lookup`);
          return;
        }
        toastSuccess(toast, "No Peers Found", "You are the only user connected to this workspace");
      } else {
        toastSuccess(toast, "Peers Discovered", `Found ${processedPeers.length} other user${processedPeers.length > 1 ? 's' : ''} in the workspace`);
      }
    } catch (error) {
      debugLog('PeerDiscoveryModal', 'Failed to discover peers via ListAllPeers:', error);
      try {
        const sessionPeers = await discoverPeersViaGetSessions(currentCid);
        if (sessionPeers.length > 0) {
          setPeers(sessionPeers);
          loadRegisteredPeers().catch(err => { debugLog('PeerDiscoveryModal', 'Could not load registered peers:', err); });
          toastSuccess(toast, "Peers Discovered", `Found ${sessionPeers.length} other user${sessionPeers.length > 1 ? 's' : ''} via session lookup`);
          return;
        }
      } catch (fallbackError) {
        debugLog('PeerDiscoveryModal', 'GetSessions fallback also failed:', fallbackError);
      }
      toastError(toast, "Discovery Failed", "Could not discover peers in the workspace");
    } finally {
      setLoading(false);
    }
  }, [currentCid, toast, loadRegisteredPeers]);

  // Trigger discovery when modal opens
  useEffect(() => {
    if (isOpen) {
      runAsyncSetup(discoverPeers);
      const loadOutgoing = async () => {
        const bigintCids = await peerRegistrationStore.getOutgoingRequestCids();
        const stringCids = new Set<string>();
        bigintCids.forEach(cid => stringCids.add(cid.toString()));
        setOutgoingRequests(stringCids);
      };
      runAsyncSetup(loadOutgoing);
    }
  }, [isOpen, discoverPeers]);

  const acceptIncomingRequest = async (request: PendingPeerRequest) => {
    setAcceptingPeerCid(request.peer_cid.toString());
    try {
      await peerRegistrationStore.acceptRequest(request.id);
      await loadRegisteredPeers();
    } catch (error) {
      toastError(toast, 'Failed to Accept', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setAcceptingPeerCid(null);
    }
  };

  const registerWithPeer = async (peerCid: string, peerUsername: string) => {
    if (!currentCid) {
      toastError(toast, "Not Connected", "Please connect to a workspace first");
      return;
    }
    try {
      const requestId = crypto.randomUUID();
      broadcastChannelService.registerRequest(requestId, currentCid);
      const request = {
        PeerRegister: {
          request_id: requestId, cid: currentCid,
          peer_cid: BigInt(peerCid), session_security_settings: getDefaultSecuritySettings(),
          connect_after_register: false, peer_session_password: null
        }
      };
      const now = Date.now();
      await peerRegistrationStore.addOutgoingRequest({
        id: requestId, fromCid: currentCid, toCid: BigInt(peerCid),
        peerUsername: peerUsername, timestamp: now, timeLastSent: now
      });
      // Before the send: a failure can arrive before the await resolves.
      sentRequests.current.set(requestId, peerUsername);
      await websocketService.sendMessage(request);
      toast({
        title: "Request Sent",
        description: `Connection request sent to ${peerUsername}. They will receive it when online.`,
        variant: 'success',
      });
    } catch (error) {
      debugLog('PeerDiscoveryModal', 'Failed to send registration request:', error);
      toastError(toast, "Request Failed", "Could not send registration request");
    }
  };

  return {
    peers, registeredPeers, outgoingRequests, incomingRequests,
    loading, acceptingPeerCid, currentCid, currentUsername,
    discoverPeers, acceptIncomingRequest, registerWithPeer,
  };
}
