/**
 * The first file offer from a peer, while the person has not yet said whether to always accept
 * that peer's files. Re-read whenever a transfer changes, so an offer arriving while the chat
 * is open is asked about at once.
 */
import { useCallback, useEffect, useState } from 'react';
import { useEventListener } from '@/hooks/use-event-listener';
import { fileTransferService } from '@/lib/file-transfer';
import { FILE_TRANSFER_EVENTS } from '@/lib/file-transfer/events';
import { offerToAskAbout } from '@/lib/file-transfer/always-accept';
import type { FileTransfer } from '@/lib/file-transfer/types';

export interface AlwaysAcceptPrompt {
  /** The offer being asked about, or null when there is nothing to ask. */
  readonly offer: FileTransfer | null;
  /** Records the answer in the chat settings; "always" also accepts this offer. */
  readonly answer: (always: boolean) => Promise<void>;
  /** Closes without answering: not asked again about this offer, asked again on the next. */
  readonly dismiss: () => void;
}

export function useAlwaysAcceptPrompt(peerCid: bigint, accept: (transferId: string) => Promise<void>): AlwaysAcceptPrompt {
  const peer: string = peerCid.toString();
  const [offer, setOffer] = useState<FileTransfer | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const reread: () => void = useCallback((): void => {
    const next: FileTransfer | null = offerToAskAbout(fileTransferService.getSettings(peer), fileTransferService.getTransfersForPeer(peer));
    setOffer(next !== null && next.id !== dismissed ? next : null);
  }, [peer, dismissed]);
  useEffect(reread, [reread]);
  useEventListener(FILE_TRANSFER_EVENTS.STATE_CHANGED, reread);

  const answer = useCallback(async (always: boolean): Promise<void> => {
    const asked: FileTransfer | null = offer;
    setOffer(null);
    await fileTransferService.setAutoAccept(peer, always);
    if (always && asked !== null) await accept(asked.id);
  }, [offer, peer, accept]);

  const dismiss = useCallback((): void => {
    if (offer !== null) setDismissed(offer.id);
    setOffer(null);
  }, [offer]);

  return { offer, answer, dismiss };
}
