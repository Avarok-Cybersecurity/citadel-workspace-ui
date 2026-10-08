import { Check, CheckCheck, Clock, RefreshCw, XCircle } from 'lucide-react';
import type { P2PMessage } from '@/lib/p2p';
import { formatTime } from '@/components/chat/shared';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MessageStatusDetails } from './MessageStatusDetails';

interface BubbleFooterProps {
  message: P2PMessage;
  isOwn: boolean;
  onRetry?: () => void;
}

// These ticks show only on the sender's own bubble (bg-primary), where muted measured
// 1.09:1 light and 2.53:1 dark; they take the bubble's foreground (UX review).
function getMessageStatusIcon(message: P2PMessage): JSX.Element | null {
  switch (message.status) {
    case 'pending':
      return <Clock className="h-3 w-3 text-primary-foreground" data-testid="message-status-pending" />;
    case 'sent':
      return <Check className="h-3 w-3 text-primary-foreground" data-testid="message-status-sent" />;
    case 'delivered':
      return <CheckCheck className="h-3 w-3 text-primary-foreground" data-testid="message-status-delivered" />;
    case 'read':
      return <CheckCheck className="h-3.5 w-3.5 text-read-receipt" strokeWidth={2.5} data-testid="message-status-read" aria-label="Seen" />;
    case 'failed':
      return <XCircle className="h-3 w-3 text-destructive" data-testid="message-status-failed" />;
    default:
      return null;
  }
}

export function BubbleFooter({ message, isOwn, onRetry }: BubbleFooterProps): JSX.Element {
  const isFailed: boolean = message.status === 'failed';
  const statusIcon: JSX.Element | null = getMessageStatusIcon(message);

  return (
    <>
      <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
        {/* Dimmed only off the sender's bubble: on bg-primary it measured 3.73:1 dimmed. */}
        <span className={`text-xs ${isOwn ? '' : 'opacity-70'}`} data-testid="message-timestamp">
          {formatTime(message.timestamp)}
        </span>
        {message.edited_at !== undefined && (
          // Both parties need to see that a message was revised, or an edit is
          // indistinguishable from having misread the original.
          <span
            className="text-xs opacity-90"
            data-testid="message-edited-marker"
            title={`Edited ${formatTime(message.edited_at)}`}
          >
            (edited)
          </span>
        )}
        {isOwn && statusIcon && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help inline-flex">
                  {statusIcon}
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="bg-background border-border p-3"
              >
                <MessageStatusDetails message={message} />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {/* Retry button for failed messages */}
        {isOwn && isFailed && onRetry && (
          <button
            onClick={onRetry}
            className="ml-1 p-0.5 rounded hover:bg-foreground/10 transition-colors"
            title="Retry sending"
          >
            <RefreshCw className="h-3 w-3 text-destructive hover:text-foreground" />
          </button>
        )}
      </div>
      {/* Error message for failed sends */}
      {isOwn && isFailed && message.error && (
        <p className="text-xs text-destructive-emphasis mt-1">{message.error}</p>
      )}
    </>
  );
}
