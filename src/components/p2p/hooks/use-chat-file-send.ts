import { useState } from 'react';
import { useP2PFileTransfer } from './useP2PFileTransfer';
import { dropUnavailableReason } from '../drop-unavailable';

type FileTransfer = ReturnType<typeof useP2PFileTransfer>;

export interface ChatFileSend {
  /** Transfers and their actions, for the message list. */
  fileTransfer: FileTransfer;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  /** Props for the conversation's drop target. */
  drop: { onFile: (file: File) => void; unavailable: string | null };
}

/**
 * How a file leaves this conversation: the paperclip's dialog and a file dropped on the chat are
 * two doors to one send entry (`handleSendFile`). The hook has already toasted a failure, so the
 * drop only swallows the rejection, it does not hide it.
 */
export function useChatFileSend(params: { peerCid: bigint; peerName: string; viewingDocument: boolean; paused: boolean }): ChatFileSend {
  const fileTransfer: FileTransfer = useP2PFileTransfer({ peerCid: params.peerCid, peerName: params.peerName });
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  return {
    fileTransfer,
    dialogOpen,
    openDialog: (): void => setDialogOpen(true),
    closeDialog: (): void => setDialogOpen(false),
    drop: {
      onFile: (file: File): void => { fileTransfer.handleSendFile(file).catch((): void => {}); },
      unavailable: dropUnavailableReason({ viewingDocument: params.viewingDocument, paused: params.paused }),
    },
  };
}
