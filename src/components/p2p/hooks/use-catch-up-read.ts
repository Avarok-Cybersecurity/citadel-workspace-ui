/**
 * Marks a conversation read when the reader catches up with what the notch was
 * counting (View, or scrolling to the bottom), provided the window is in front
 * on the Messages tab. Passed to useStickToBottom as `onCaughtUp`.
 */
import { useCallback, type MutableRefObject } from 'react';
import { P2PMessengerManager } from '@/lib/p2p';
import { debugLog } from '@/lib/debug-config';
import { readableNow } from './useP2PMessages-read-gate';

export function useCatchUpRead(
  peerCid: bigint,
  activeTabIdRef: MutableRefObject<string>,
  pinnedRef: MutableRefObject<boolean>,
): () => void {
  return useCallback((): void => {
    if (!readableNow(activeTabIdRef, pinnedRef)) return;
    P2PMessengerManager.getInstance().markMessagesAsRead(peerCid).catch((err: unknown) => debugLog('UseP2PMessages', 'Error:', err));
  }, [peerCid, activeTabIdRef, pinnedRef]);
}
