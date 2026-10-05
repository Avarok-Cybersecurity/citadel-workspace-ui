/**
 * A send-queue port for tests whose subject is the ordinary send: the peer is
 * known to be online, so nothing is held (see a-send-to-an-offline-peer-waits).
 */
import type { SendQueuePort } from '../send-queue-hold';

export const ONLINE_PEER_QUEUE: SendQueuePort = {
  peerOnlineStatus: (): boolean => true,
  peerName: (): string => 'Peer',
  hold: async (): Promise<void> => { throw new Error('nothing is held for an online peer'); },
  take: async (): Promise<undefined> => undefined,
  release: async (): Promise<void> => undefined,
};
