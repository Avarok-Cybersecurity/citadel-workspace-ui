/**
 * What a peer connection's reported path is called on screen. One copy of each
 * string, read by the peer row, the chat header and their tests.
 */
import type { PeerConnectPath, PeerPathReport } from '@/types/ice-servers';

export const CONNECTION_PATH_COPY: Readonly<Record<PeerConnectPath, string>> = {
  direct: 'Direct',
  turn: 'Relayed via Cloudflare TURN',
  server_relay: 'Via workspace server',
};

export function connectionPathLabel(path: PeerConnectPath | null): string | null {
  return path === null ? null : CONNECTION_PATH_COPY[path];
}

export const CHAT_PATH_COPY: Readonly<{ relayed: string; upgrading: string }> = {
  relayed: 'Relayed',
  upgrading: 'Messages go through the server while a direct connection is set up',
};

/** The chat header's short label for a connection's path. */
export interface ChatPathLabel {
  text: string;
  /** Why it reads as it does; null when the label says it all. */
  tooltip: string | null;
  direct: boolean;
}

/**
 * "Direct", or "Relayed" for a TURN or server-relay path. While an upgrade is
 * under way the tooltip says so; a relay that will stay says which relay.
 */
export function chatPathLabel(route: PeerPathReport | null): ChatPathLabel | null {
  if (route === null) return null;
  if (route.path === 'direct') return { text: CONNECTION_PATH_COPY.direct, tooltip: null, direct: true };
  const tooltip: string = route.upgrading ? CHAT_PATH_COPY.upgrading : CONNECTION_PATH_COPY[route.path];
  return { text: CHAT_PATH_COPY.relayed, tooltip, direct: false };
}
