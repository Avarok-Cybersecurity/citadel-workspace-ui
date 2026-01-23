import { TextBubble } from './TextBubble';
import { MarkdownBubble } from './MarkdownBubble';
import { LiveDocumentBubble } from './LiveDocumentBubble';
import { FileTransferBubble } from './FileTransferBubble';
import { getBubbleContainerStyles } from './types';
import type { P2PMessage } from '@/lib/p2p';

interface MessageBubbleProps {
  message: P2PMessage;
  isOwn: boolean;
  onRetry?: () => void;
  onOpenDocument?: (documentId: string, documentTitle: string) => void;
  onAcceptTransfer?: (transferId: string) => void;
  onDeclineTransfer?: (transferId: string) => void;
  onCancelTransfer?: (transferId: string) => void;
  onOpenFile?: (downloadPath: string) => void;

  // Group mode display options
  showSenderName?: boolean;
  showSenderAvatar?: boolean;
  senderName?: string;

  // Message actions (group mode)
  onEdit?: () => void;
  onDelete?: () => void;
  onReply?: () => void;
}

export function MessageBubble({
  message,
  isOwn,
  onRetry,
  onOpenDocument,
  onAcceptTransfer,
  onDeclineTransfer,
  onCancelTransfer,
  onOpenFile,
  showSenderName,
  showSenderAvatar,
  senderName,
  onEdit,
  onDelete,
  onReply,
}: MessageBubbleProps) {
  const containerStyles = getBubbleContainerStyles(isOwn);

  // Common props for all bubble types
  const commonProps = {
    message,
    isOwn,
    onRetry,
    showSenderName,
    showSenderAvatar,
    senderName,
    onEdit,
    onDelete,
    onReply,
  };

  const renderBubble = () => {
    switch (message.message_type) {
      case 'markdown':
        return <MarkdownBubble {...commonProps} />;

      case 'live_document':
        return (
          <LiveDocumentBubble
            {...commonProps}
            onOpenDocument={onOpenDocument}
          />
        );

      case 'file_transfer':
        return (
          <FileTransferBubble
            {...commonProps}
            onAccept={onAcceptTransfer}
            onDecline={onDeclineTransfer}
            onCancel={onCancelTransfer}
            onOpen={onOpenFile}
          />
        );

      case 'text':
      default:
        return <TextBubble {...commonProps} />;
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
