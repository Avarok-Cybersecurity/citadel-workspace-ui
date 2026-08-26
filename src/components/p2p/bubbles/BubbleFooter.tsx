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

function getMessageStatusIcon(message: P2PMessage) {
  switch (message.status) {
    case 'pending':
      return <Clock className="h-3 w-3 text-muted-foreground" data-testid="message-status-pending" />;
    case 'sent':
      return <Check className="h-3 w-3 text-muted-foreground" data-testid="message-status-sent" />;
    case 'delivered':
      return <CheckCheck className="h-3 w-3 text-muted-foreground" data-testid="message-status-delivered" />;
    case 'read':
      return <CheckCheck className="h-3 w-3 text-primary-accent" data-testid="message-status-read" />;
    case 'failed':
      return <XCircle className="h-3 w-3 text-destructive" data-testid="message-status-failed" />;
    default:
      return null;
  }
}

export function BubbleFooter({ message, isOwn, onRetry }: BubbleFooterProps) {
  const isFailed = message.status === 'failed';
  const statusIcon = getMessageStatusIcon(message);

  return (
    <>
      <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <span className="text-xs opacity-70" data-testid="message-timestamp">
          {formatTime(message.timestamp)}
        </span>
        {message.edited_at !== undefined && (
          // Both parties need to see that a message was revised, or an edit is
          // indistinguishable from having misread the original.
          <span
            className="text-xs opacity-70"
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
