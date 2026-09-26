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
import type { FileTransferMode } from '@/types/messaging-layer';
import { debugLog } from '@/lib/debug-config';

interface UseP2PFileTransferProps {
  peerCid: bigint;
  peerName: string;
}

interface UseP2PFileTransferReturn {
  handleSendFile: (file: File, mode: FileTransferMode) => Promise<void>;
  handleAcceptTransfer: (transferId: string) => Promise<void>;
  handleDeclineTransfer: (transferId: string) => Promise<void>;
  handleCancelTransfer: (transferId: string) => Promise<void>;
  handleOpenFile: (transferId: string) => void;
  /** The received file whose details are showing, or null. */
  openedFile: FileDetails | null;
  closeOpenedFile: () => void;
}

export function useP2PFileTransfer({
  peerCid,
  peerName,
}: UseP2PFileTransferProps): UseP2PFileTransferReturn {
  const { toast } = useToast();

  const handleSendFile: (file: File, mode: FileTransferMode) => Promise<void> = useCallback(async (file: File, mode: FileTransferMode): Promise<void> => {
    try {
      await fileTransferService.sendFile(peerCid.toString(), file, mode);
      toast({
        title: 'File Sent',
        description: `Sending ${file.name} to ${peerName}`,
      });
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

  // The same details the sidebar's Files list shows. The file is on the
  // agent's own filesystem and the browser has no route to it (see
  // FilePreviewDialog), so what arrived and where it was saved is the answer.
  const handleOpenFile: (transferId: string) => void = useCallback((transferId: string): void => {
    const transfer: FileTransfer | undefined = fileTransferService.getTransfer(transferId);
    if (!transfer?.downloadPath) {
      toast({ variant: 'destructive', title: 'File location not known', description: 'This device has no record of where this file was saved.' });
      return;
    }
    setOpenedFile(transferDetails(transfer, (cid: string): string | undefined => (cid === peerCid.toString() ? peerName : undefined)).details);
  }, [toast, peerCid, peerName]);

  return {
    handleSendFile,
    handleAcceptTransfer,
    handleDeclineTransfer,
    handleCancelTransfer,
    handleOpenFile,
    openedFile,
    closeOpenedFile: (): void => setOpenedFile(null),
  };
}
