/**
 * Telling the messenger which conversation this window has open.
 *
 * The messenger held that since it was written, and both notification surfaces
 * read it -- the agent's native notices through ReportFocus, the in-app toast
 * through the arrival notice -- but nothing set it, so every message for the open
 * chat notified as if it were elsewhere. The chat sets it while it is mounted.
 */
import { useEffect } from 'react';
import { P2PMessengerManager } from '@/lib/p2p';

export function useOpenConversation(peerCid: bigint | null): void {
  useEffect(() => {
    if (!peerCid) return;
    const messenger: P2PMessengerManager = P2PMessengerManager.getInstance();
    messenger.setActiveConversation(peerCid);
    return (): void => { messenger.setActiveConversation(null); };
  }, [peerCid]);
}
