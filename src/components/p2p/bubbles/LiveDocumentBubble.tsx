import { FileText, Users } from 'lucide-react';
import { getBubbleStyles, BUBBLE_MAX_WIDTH } from './types';
import { BubbleFooter } from './BubbleFooter';
import type { LiveDocumentBubbleProps } from './types';

export function LiveDocumentBubble({ message, isOwn, onRetry, onOpenDocument }: LiveDocumentBubbleProps) {
  const isFailed = message.status === 'failed';
  const bubbleStyles: string = getBubbleStyles(isOwn, isFailed);

  const handleClick = (): void => {
    if (message.document_id && onOpenDocument) {
      onOpenDocument(message.document_id, message.document_title || 'Untitled Document');
    }
  };

  return (
    <div className={`${BUBBLE_MAX_WIDTH} rounded-lg px-3 py-2 ${bubbleStyles}`}>
      <button
        onClick={handleClick}
        className="w-full text-left hover:opacity-90 transition-opacity"
        disabled={!message.document_id}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded bg-foreground/10">
            <FileText className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">
              {message.document_title || 'Untitled Document'}
            </p>
            <div className="flex items-center gap-1 text-xs opacity-70">
              <Users className="h-3 w-3" />
              <span>Live Document</span>
            </div>
          </div>
        </div>
        <p className="text-xs opacity-70 mt-1">
          Click to open and edit collaboratively
        </p>
      </button>
      <BubbleFooter message={message} isOwn={isOwn} onRetry={onRetry} />
    </div>
  );
}
