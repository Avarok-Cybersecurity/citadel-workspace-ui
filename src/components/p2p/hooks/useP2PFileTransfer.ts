/**
 * useP2PFileTransfer Hook
 *
 * Handles file transfer operations for P2P chat including sending files,
 * accepting/declining transfers, canceling transfers, and opening downloaded files.
 */

import { useCallback, useState } from 'react';
import type { FileDetails } from '@/components/layout/sidebar/file-details';
import { failureDescription } from '@/lib/p2p/peer-failure-detail';
import type { FilePort, FileSendReceipt } from '@/lib/chat/transport/chat-transport';
import { useToast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debug-config';

interface UseP2PFileTransferProps {
  /** Null where the conversation carries no files; every action then says so. */
  files: FilePort | null;
  /** Who receives it, as a sentence names them. */
  recipient: string;
}

const NO_FILES: Error = new Error('Files cannot be sent in this conversation');

interface UseP2PFileTransferReturn {
  handleSendFile: (file: File) => Promise<void>;
  handleAcceptTransfer: (transferId: string) => Promise<void>;
  handleDeclineTransfer: (transferId: string) => Promise<void>;
  handleCancelTransfer: (transferId: string) => Promise<void>;
  handleOpenFile: (transferId: string) => void;
  /** The received file whose details are showing, or null. */
  openedFile: FileDetails | null;
  closeOpenedFile: () => void;
}

export function useP2PFileTransfer({
  files,
  recipient,
}: UseP2PFileTransferProps): UseP2PFileTransferReturn {
  const { toast } = useToast();

  const handleSendFile: (file: File) => Promise<void> = useCallback(async (file: File): Promise<void> => {
    try {
      if (files === null) throw NO_FILES;
      // The bubble now carries the send: preparing, then offered. "File Sent" said it was
      // done while it was still uploading from this tab, and said nothing of a held send.
      const { held }: FileSendReceipt = await files.send(file);
      toast(held
        ? { title: `Will send ${file.name} when ${recipient} is online`, description: 'Keep this browser open; it goes by itself.' }
        : { title: `Preparing to send ${file.name}`, description: `Keep this tab open until ${recipient} is offered it.` });
    } catch (error) {
      debugLog('UseP2PFileTransfer', 'Failed to send file:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to send file',
        description: failureDescription(error, 'Check your connection and try again.'),
      });
      throw error;
    }
  }, [files, recipient, toast]);

  const handleAcceptTransfer: (transferId: string) => Promise<void> = useCallback(async (transferId: string): Promise<void> => {
    try {
      if (files === null) throw NO_FILES;
      await files.accept(transferId);
    } catch (error) {
      debugLog('UseP2PFileTransfer', 'Failed to accept transfer:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to accept file',
        description: failureDescription(error, 'Unknown error'),
      });
    }
  }, [files, toast]);

  // Decline and cancel report failures the same way accept above already did.
  // They used to only debugLog, which is a no-op outside dev — so a decline
  // that failed left the request sitting there with no explanation, and the
  // obvious reading is that the button is broken.
  const handleDeclineTransfer: (transferId: string) => Promise<void> = useCallback(async (transferId: string): Promise<void> => {
    try {
      if (files === null) throw NO_FILES;
      await files.decline(transferId);
    } catch (error) {
      debugLog('UseP2PFileTransfer', 'Failed to decline transfer:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to decline file',
        description: failureDescription(error, 'Unknown error'),
      });
    }
  }, [files, toast]);

  const handleCancelTransfer: (transferId: string) => Promise<void> = useCallback(async (transferId: string): Promise<void> => {
    try {
      if (files === null) throw NO_FILES;
      await files.cancel(transferId);
    } catch (error) {
      debugLog('UseP2PFileTransfer', 'Failed to cancel transfer:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to cancel transfer',
        description: failureDescription(error, 'Unknown error'),
      });
    }
  }, [files, toast]);

  const [openedFile, setOpenedFile] = useState<FileDetails | null>(null);

  // The same details the sidebar's Files list shows.
  const handleOpenFile: (transferId: string) => void = useCallback((transferId: string): void => {
    const details: FileDetails | null = files?.details(transferId) ?? null;
    if (details === null) {
      toast({ variant: 'destructive', title: 'File location not known', description: 'This device has no record of where this file was saved.' });
      return;
    }
    setOpenedFile(details);
  }, [toast, files]);

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
