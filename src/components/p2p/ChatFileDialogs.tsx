import { FilePreviewDialog } from '@/components/layout/sidebar/FilePreviewDialog';
import { FileTransferModal } from './FileTransferModal';
import type { ChatFileSend } from './hooks/use-chat-file-send';
import type React from 'react';
import type { FilePort } from '@/lib/chat/transport/chat-transport';
import type { TestIdAttribute } from '@/components/chat/pane/pane-test-ids';

/**
 * The file dialogs of a conversation: sending one (the paperclip) and opening a received one.
 * With one peer the paperclip opens the send dialog, whose native-picker and storage paths
 * address that peer; with many it opens the browser's picker, and the file goes through the
 * transport's send like a drop does.
 */
export function ChatFileDialogs({ send, files, picker }: { send: ChatFileSend; files: FilePort; picker: TestIdAttribute }): JSX.Element {
  const { fileTransfer } = send;
  const onPicked = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file: File | undefined = e.target.files?.[0];
    e.target.value = ''; // so picking the same file again still fires a change
    if (file) fileTransfer.handleSendFile(file).catch((): void => {}); // the hook has toasted it
  };
  return (
    <>
      {files.dialogKey !== null
        ? <FileTransferModal isOpen={send.dialogOpen} onClose={send.closeDialog} onSendFile={fileTransfer.handleSendFile} peerCid={files.dialogKey} />
        : <input ref={send.pickerRef} type="file" className="hidden" onChange={onPicked} aria-hidden="true" tabIndex={-1} {...picker} />}
      <FilePreviewDialog file={fileTransfer.openedFile} isOpen={fileTransfer.openedFile !== null} onClose={fileTransfer.closeOpenedFile} />
    </>
  );
}
