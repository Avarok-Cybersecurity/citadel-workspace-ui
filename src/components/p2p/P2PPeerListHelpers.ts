/**
 * Types, constants, and helpers for P2PPeerList component.
 */

export interface PeerInfo {
  cid: string;
  name: string;
  isConnected: boolean;
  unreadCount: number;
  lastMessage?: string;
  lastMessageTime?: number;
}

/** Demo peer data (module-level constant -- stable across renders) */
export const DEMO_PEERS: PeerInfo[] = [
  {
    cid: 'demo-peer-kathy',
    name: 'Kathy McCooper',
    isConnected: true,
    unreadCount: 0,
    lastMessage: 'Hey! How\'s the project going?',
    lastMessageTime: Date.now() - 1000 * 60 * 5 // 5 minutes ago
  }
];

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

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
