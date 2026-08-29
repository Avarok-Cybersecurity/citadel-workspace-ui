/**
 * useConversationPeers Hook
 *
 * Manages peers with active P2P conversations, sorted by last message time.
 */

import { useState, useEffect, useCallback } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import { p2pAutoConnectService } from '@/lib/p2p-auto-connect-service';
import { P2PMessengerManager } from '@/lib/p2p';
import { connectionManager } from '@/lib/connection';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import type { RegisteredPeer } from './use-registered-peers';

export interface ConversationPeer {
  peerCid: string;
  peerUsername: string;
  isOnline: boolean;
  isConnected: boolean;
  unreadCount: number;
  lastMessageTime?: number;
}

interface UseConversationPeersProps {
  registeredPeers: RegisteredPeer[];
}

interface UseConversationPeersReturn {
  peersWithConversations: ConversationPeer[];
  refreshConversations: () => Promise<void>;
}

export function useConversationPeers({
  registeredPeers,
}: UseConversationPeersProps): UseConversationPeersReturn {
  const [peersWithConversations, setPeersWithConversations] = useState<ConversationPeer[]>([]);

  const loadConversations = useCallback(async (): Promise<void> => {
    const messenger: P2PMessengerManager = P2PMessengerManager.getInstance();
    const conversations = messenger.getAllConversations();

    // Get current user's CID to filter out self-conversations
    const currentCid = connectionManager.getConnectionInfo()?.cid?.toString();

    // Only include peers with actual messages, excluding self-conversations
    const filteredConversations = conversations
      .filter(c => c.messages.length > 0)
      .filter(c => c.peerCid.toString() !== currentCid);

    const convPeers = await Promise.all(filteredConversations.map(async c => {
      const peerCidStr: string = c.peerCid.toString();
      // Find the username from registered peers
      const registeredPeer = registeredPeers.find(p => p.cid === peerCidStr);
      // Prefer registered peer username, then a friendly "Peer" label
      const displayName: string = registeredPeer?.username ||
        (peerCidStr ? `Peer ${peerCidStr.slice(-6)}` : 'Unknown Peer');
      return {
        peerCid: peerCidStr,
        peerUsername: displayName,
        isOnline: p2pAutoConnectService.isPeerOnline(c.peerCid),
        isConnected: await p2pAutoConnectService.isPeerConnected(c.peerCid),
        unreadCount: c.unreadCount,
        lastMessageTime: c.messages[c.messages.length - 1]?.timestamp
      };
    }));

    // Sort by most recent message
    convPeers.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));

    setPeersWithConversations(convPeers);
  }, [registeredPeers]);

  useEffect(() => {
    runAsyncSetup(loadConversations);

    const handleMessageUpdate = async (): Promise<void> => { await loadConversations(); };

    eventEmitter.on('p2p:message-received', handleMessageUpdate);
    eventEmitter.on('p2p:message-sent', handleMessageUpdate);
    eventEmitter.on('p2p:conversation-updated', handleMessageUpdate);

    return (): void => {
      eventEmitter.off('p2p:message-received', handleMessageUpdate);
      eventEmitter.off('p2p:message-sent', handleMessageUpdate);
      eventEmitter.off('p2p:conversation-updated', handleMessageUpdate);
    };
  }, [loadConversations]);

  return {
    peersWithConversations,
    refreshConversations: loadConversations,
  };
}
