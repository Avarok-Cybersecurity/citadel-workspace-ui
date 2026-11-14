import { FilePreviewDialog } from '@/components/layout/sidebar/FilePreviewDialog';
import { FileTransferModal } from './FileTransferModal';
import type { ChatFileSend } from './hooks/use-chat-file-send';
import { AlwaysAcceptDialog } from './AlwaysAcceptDialog';
import { useAlwaysAcceptPrompt, type AlwaysAcceptPrompt } from './hooks/useAlwaysAcceptPrompt';

/**
 * The file dialogs of a conversation: sending one (the paperclip), a received one that could not
 * be opened, and the once-per-peer "always accept?" on the first offer.
 */
export function ChatFileDialogs({ send, peerCid, peerName }: { send: ChatFileSend; peerCid: bigint; peerName: string }): JSX.Element {
  const { fileTransfer } = send;
  const alwaysAccept: AlwaysAcceptPrompt = useAlwaysAcceptPrompt(peerCid, fileTransfer.handleAcceptTransfer);
  return (
    <>
      <FileTransferModal isOpen={send.dialogOpen} onClose={send.closeDialog} onSendFile={fileTransfer.handleSendFile} peerCid={peerCid.toString()} />
      <FilePreviewDialog file={fileTransfer.openedFile} isOpen={fileTransfer.openedFile !== null} onClose={fileTransfer.closeOpenedFile} failure={fileTransfer.openFailure} />
      <AlwaysAcceptDialog prompt={alwaysAccept} peerName={peerName} />
    </>
  );
}
