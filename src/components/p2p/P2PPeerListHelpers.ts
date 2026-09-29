/**
 * Types, constants, and helpers for P2PPeerList component.
 */
import { peerDisplayName } from '@/lib/peer-display';
import type { Peer } from '@/lib/p2p-registration-service';

export interface PeerInfo {
  cid: string;
  name: string;
  isConnected: boolean;
  unreadCount: number;
  lastMessage?: string;
  lastMessageTime?: number;
}

export function formatTime(timestamp: number): string {
  const date: Date = new Date(timestamp);
  const now: Date = new Date();
  const diff: number = now.getTime() - date.getTime();
  const days: number = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

/**
 * A conversation row's name: the registered peer's identity, as the sidebar
 * shows it. The conversation record's own username is only a fallback; one
 * created from an incoming message has none, and the row read "Peer D7U2E0"
 * beside a sidebar that said "Thomas Braun".
 */
export function conversationPeerName(peerCid: bigint, conversationUsername: string | undefined, registered: readonly Peer[]): string {
  const peer: Peer | undefined = registered.find((p: Peer): boolean => p.cid === peerCid);
  return peerDisplayName({ cid: peerCid, username: peer?.username ?? conversationUsername, fullName: peer?.fullName });
}
