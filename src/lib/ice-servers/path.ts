/** Reading the connection path an agent reports on PeerConnectSuccess. */
import type { PeerConnectPath } from '@/types/ice-servers';

const PATHS: readonly PeerConnectPath[] = ['direct', 'turn', 'server_relay'];

/** `PeerConnectSuccess.path`, or null from an agent that does not report one. */
export function parsePeerConnectPath(value: unknown): PeerConnectPath | null {
  return PATHS.find((p: PeerConnectPath): boolean => p === value) ?? null;
}
