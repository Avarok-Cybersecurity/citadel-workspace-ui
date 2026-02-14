/**
 * P2P Messaging Adapter - Barrel Export
 */
export { P2PMessagingAdapter } from './adapter';
export { convertP2PMessageToChatMessage, mapP2PStatus } from './converters';

import { P2PMessagingAdapter } from './adapter';

/**
 * Factory function to create a P2P messaging adapter
 */
export function createP2PMessagingAdapter(
  peerCid: bigint,
  peerName: string,
  currentUserId: bigint,
  currentUserName: string
): P2PMessagingAdapter {
  return new P2PMessagingAdapter(peerCid, peerName, currentUserId, currentUserName);
}
