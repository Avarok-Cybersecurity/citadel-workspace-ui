import { TextBubble } from './TextBubble';
import { MarkdownBubble } from './MarkdownBubble';
import { LiveDocumentBubble } from './LiveDocumentBubble';
import { FileTransferBubble } from './FileTransferBubble';
import { getBubbleContainerStyles } from './types';
import type { P2PMessage } from '@/lib/p2p-messenger-manager';

interface MessageBubbleProps {
  message: P2PMessage;
  isOwn: boolean;
  onRetry?: () => void;
  onOpenDocument?: (documentId: string, documentTitle: string) => void;
  onAcceptTransfer?: (transferId: string) => void;
  onDeclineTransfer?: (transferId: string) => void;
  onCancelTransfer?: (transferId: string) => void;
  onOpenFile?: (downloadPath: string) => void;
}

export function MessageBubble({
  message,
  isOwn,
  onRetry,
  onOpenDocument,
  onAcceptTransfer,
  onDeclineTransfer,
  onCancelTransfer,
  onOpenFile
}: MessageBubbleProps) {
  const containerStyles = getBubbleContainerStyles(isOwn);

  const renderBubble = () => {
    switch (message.message_type) {
      case 'markdown':
        return <MarkdownBubble message={message} isOwn={isOwn} onRetry={onRetry} />;

      case 'live_document':
        return (
          <LiveDocumentBubble
            message={message}
            isOwn={isOwn}
            onRetry={onRetry}
            onOpenDocument={onOpenDocument}
          />
        );

      case 'file_transfer':
        return (
          <FileTransferBubble
            message={message}
            isOwn={isOwn}
            onRetry={onRetry}
            onAccept={onAcceptTransfer}
            onDecline={onDeclineTransfer}
            onCancel={onCancelTransfer}
            onOpen={onOpenFile}
          />
        );

      case 'text':
      default:
        return <TextBubble message={message} isOwn={isOwn} onRetry={onRetry} />;
    }
  };

  return (
    <div className={containerStyles}>
      {renderBubble()}
    </div>
  );
}

// Export all bubble components for direct use if needed
export { TextBubble } from './TextBubble';
export { MarkdownBubble } from './MarkdownBubble';
export { LiveDocumentBubble } from './LiveDocumentBubble';
export { FileTransferBubble } from './FileTransferBubble';
export { BubbleFooter } from './BubbleFooter';
export * from './types';
