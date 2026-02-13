/**
 * useP2PFileTransfer Hook
 *
 * Handles file transfer operations for P2P chat including sending files,
 * accepting/declining transfers, canceling transfers, and opening downloaded files.
 */

import { useCallback } from 'react';
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

  const handleSendFile = useCallback(async (file: File, mode: FileTransferMode) => {
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
        description: error instanceof Error ? error.message : 'Check your connection and try again.',
      });
      throw error;
    }
  }, [peerCid, peerName, toast]);

  const handleAcceptTransfer = useCallback(async (transferId: string) => {
    try {
      await fileTransferService.acceptTransfer(transferId);
    } catch (error) {
      debugLog('UseP2PFileTransfer', 'Failed to accept transfer:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to accept file',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [toast]);

  const handleDeclineTransfer = useCallback(async (transferId: string) => {
    try {
      await fileTransferService.declineTransfer(transferId);
    } catch (error) {
      debugLog('UseP2PFileTransfer', 'Failed to decline transfer:', error);
    }
  }, []);

  const handleCancelTransfer = useCallback(async (transferId: string) => {
    try {
      await fileTransferService.cancelTransfer(transferId);
    } catch (error) {
      debugLog('UseP2PFileTransfer', 'Failed to cancel transfer:', error);
    }
  }, []);

  const handleOpenFile = useCallback((downloadPath: string) => {
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
