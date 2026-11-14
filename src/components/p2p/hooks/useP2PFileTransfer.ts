/**
 * useP2PFileTransfer Hook
 *
 * Handles file transfer operations for P2P chat including sending files,
 * accepting/declining transfers, canceling transfers, and opening downloaded files.
 */

import { useCallback, useState } from 'react';
import { transferDetails, type FileDetails } from '@/components/layout/sidebar/file-details';
import type { FileTransfer } from '@/lib/file-transfer/types';
import { failureDescription } from '@/lib/p2p/peer-failure-detail';
import { fileTransferService } from '@/lib/file-transfer';
import { useToast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debug-config';
import { openReceivedFile, type ReceivedFileRead } from '@/lib/received-files/received-file';
import { browserReceivedFileIO } from '@/lib/received-files/received-file-io';

interface UseP2PFileTransferProps {
  peerCid: bigint;
  peerName: string;
}

interface UseP2PFileTransferReturn {
  handleSendFile: (file: File) => Promise<void>;
  handleAcceptTransfer: (transferId: string) => Promise<void>;
  handleDeclineTransfer: (transferId: string) => Promise<void>;
  handleCancelTransfer: (transferId: string) => Promise<void>;
  handleOpenFile: (transferId: string) => void;
  /** The received file whose details are showing, because it could not be opened; or null. */
  openedFile: FileDetails | null;
  /** Why `openedFile` could not be downloaded. */
  openFailure: string | null;
  closeOpenedFile: () => void;
}

export function useP2PFileTransfer({
  peerCid,
  peerName,
}: UseP2PFileTransferProps): UseP2PFileTransferReturn {
  const { toast } = useToast();

  const handleSendFile: (file: File) => Promise<void> = useCallback(async (file: File): Promise<void> => {
    try {
      const id: string = await fileTransferService.sendFile(peerCid.toString(), file);
      // The bubble now carries the send: preparing, then offered. "File Sent" said it was
      // done while it was still uploading from this tab, and said nothing of a held send.
      const held: boolean = fileTransferService.getTransfer(id)?.state === 'queued';
      toast(held
        ? { title: `Will send ${file.name} when ${peerName} is online`, description: 'Keep this browser open; it goes by itself.' }
        : { title: `Preparing to send ${file.name}`, description: `Keep this tab open until ${peerName} is offered it.` });
    } catch (error) {
      debugLog('UseP2PFileTransfer', 'Failed to send file:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to send file',
        description: failureDescription(error, 'Check your connection and try again.'),
      });
      throw error;
    }
  }, [peerCid, peerName, toast]);

  const handleAcceptTransfer: (transferId: string) => Promise<void> = useCallback(async (transferId: string): Promise<void> => {
    try {
      await fileTransferService.acceptTransfer(transferId);
    } catch (error) {
      debugLog('UseP2PFileTransfer', 'Failed to accept transfer:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to accept file',
        description: failureDescription(error, 'Unknown error'),
      });
    }
  }, [toast]);

  // Decline and cancel report failures the same way accept above already did.
  // They used to only debugLog, which is a no-op outside dev — so a decline
  // that failed left the request sitting there with no explanation, and the
  // obvious reading is that the button is broken.
  const handleDeclineTransfer: (transferId: string) => Promise<void> = useCallback(async (transferId: string): Promise<void> => {
    try {
      await fileTransferService.declineTransfer(transferId);
    } catch (error) {
      debugLog('UseP2PFileTransfer', 'Failed to decline transfer:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to decline file',
        description: failureDescription(error, 'Unknown error'),
      });
    }
  }, [toast]);

  const handleCancelTransfer: (transferId: string) => Promise<void> = useCallback(async (transferId: string): Promise<void> => {
    try {
      await fileTransferService.cancelTransfer(transferId);
    } catch (error) {
      debugLog('UseP2PFileTransfer', 'Failed to cancel transfer:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to cancel transfer',
        description: failureDescription(error, 'Unknown error'),
      });
    }
  }, [toast]);

  const [openedFile, setOpenedFile] = useState<FileDetails | null>(null);
  const [openFailure, setOpenFailure] = useState<string | null>(null);

  // Like Slack: the browser downloads the original, under its own name. The file is on the
  // agent's disk; its bytes come over the agent socket (lib/received-files). Only when the agent
  // cannot hand them over (it restarted since, or the file is over the page's limit) does the
  // chat fall back to saying what arrived and where the agent saved it.
  const handleOpenFile: (transferId: string) => void = useCallback((transferId: string): void => {
    const transfer: FileTransfer | undefined = fileTransferService.getTransfer(transferId);
    if (!transfer) {
      toast({ variant: 'destructive', title: 'File not known', description: 'This device has no record of this file.' });
      return;
    }
    const opening: Promise<void> = openReceivedFile(transfer, browserReceivedFileIO).then((read: ReceivedFileRead): void => {
      if (read.kind === 'read') return;
      setOpenFailure(read.reason);
      setOpenedFile(transferDetails(transfer, (cid: string): string | undefined => (cid === peerCid.toString() ? peerName : undefined)).details);
    });
    void opening;
  }, [toast, peerCid, peerName]);
  return {
    handleSendFile,
    handleAcceptTransfer,
    handleDeclineTransfer,
    handleCancelTransfer,
    handleOpenFile,
    openedFile,
    openFailure,
    closeOpenedFile: (): void => { setOpenedFile(null); setOpenFailure(null); },
  };
}
