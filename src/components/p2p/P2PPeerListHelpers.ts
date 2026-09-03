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
