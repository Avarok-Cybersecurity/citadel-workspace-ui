/**
 * useP2PFileTransfer Hook
 *
 * Handles file transfer operations for P2P chat including sending files,
 * accepting/declining transfers, canceling transfers, and opening downloaded files.
 */

import { useCallback } from 'react';
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
  handleOpenFile: (downloadPath: string) => void;
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

  const handleOpenFile: (downloadPath: string) => void = useCallback((downloadPath: string): void => {
    debugLog('UseP2PFileTransfer', 'Opening file:', downloadPath);
    toast({
      title: 'File Ready',
      description: `File saved to: ${downloadPath}`,
    });
  }, [toast]);

  return {
    handleSendFile,
    handleAcceptTransfer,
    handleDeclineTransfer,
    handleCancelTransfer,
    handleOpenFile,
  };
}
