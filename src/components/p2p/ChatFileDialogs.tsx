import { FilePreviewDialog } from '@/components/layout/sidebar/FilePreviewDialog';
import { FileTransferModal } from './FileTransferModal';
import type { ChatFileSend } from './hooks/use-chat-file-send';
import type { FilePort } from '@/lib/chat/transport/chat-transport';

/** The two file dialogs of a conversation: sending one (the paperclip) and opening a received one. */
export function ChatFileDialogs({ send, files }: { send: ChatFileSend; files: FilePort }): JSX.Element {
  const { fileTransfer } = send;
  return (
    <>
      <FileTransferModal isOpen={send.dialogOpen} onClose={send.closeDialog} onSendFile={fileTransfer.handleSendFile} peerCid={files.dialogKey} />
      <FilePreviewDialog file={fileTransfer.openedFile} isOpen={fileTransfer.openedFile !== null} onClose={fileTransfer.closeOpenedFile} />
    </>
  );
}
