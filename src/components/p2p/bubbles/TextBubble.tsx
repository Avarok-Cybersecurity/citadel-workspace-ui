import { AlertCircle } from 'lucide-react';
import { getBubbleStyles } from './types';
import { BubbleFooter } from './BubbleFooter';
import type { BaseBubbleProps } from './types';

export function TextBubble({ message, isOwn, onRetry }: BaseBubbleProps) {
  const isFailed = message.status === 'failed';
  const bubbleStyles = getBubbleStyles(isOwn, isFailed);

  return (
    <div className={`max-w-[70%] rounded-lg px-3 py-2 ${bubbleStyles}`}>
      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      {/* Inline failure indicator */}
      {isOwn && isFailed && (
        <div className="flex items-center gap-1 mt-1.5 text-xs text-red-300">
          <AlertCircle className="h-3 w-3" />
          <span>Failed to send</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="underline hover:text-white transition-colors ml-1"
            >
              Retry
            </button>
          )}
        </div>
      )}
      <BubbleFooter message={message} isOwn={isOwn} onRetry={onRetry} />
    </div>
  );
}
