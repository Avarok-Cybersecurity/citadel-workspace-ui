import { FilePreviewDialog } from '@/components/layout/sidebar/FilePreviewDialog';
import { FileTransferModal } from './FileTransferModal';
import type { ChatFileSend } from './hooks/use-chat-file-send';

/** The two file dialogs of a conversation: sending one (the paperclip) and opening a received one. */
export function ChatFileDialogs({ send, peerCid }: { send: ChatFileSend; peerCid: bigint }): JSX.Element {
  const { fileTransfer } = send;
  return (
    <>
      <FileTransferModal isOpen={send.dialogOpen} onClose={send.closeDialog} onSendFile={fileTransfer.handleSendFile} peerCid={peerCid.toString()} />
      <FilePreviewDialog file={fileTransfer.openedFile} isOpen={fileTransfer.openedFile !== null} onClose={fileTransfer.closeOpenedFile} />
    </>
  );
}
