import { TextBubble } from './TextBubble';
import { MarkdownBubble } from './MarkdownBubble';
import { LiveDocumentBubble } from './LiveDocumentBubble';
import { getBubbleContainerStyles } from './types';
import type { P2PMessage } from '@/lib/p2p-messenger-manager';

interface MessageBubbleProps {
  message: P2PMessage;
  isOwn: boolean;
  onRetry?: () => void;
  onOpenDocument?: (documentId: string, documentTitle: string) => void;
}

export function MessageBubble({ message, isOwn, onRetry, onOpenDocument }: MessageBubbleProps) {
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
export { BubbleFooter } from './BubbleFooter';
export * from './types';
