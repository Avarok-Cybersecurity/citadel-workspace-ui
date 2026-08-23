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
      return <CheckCheck className="h-3 w-3 text-sky-400" data-testid="message-status-read" />;
    case 'failed':
      return <XCircle className="h-3 w-3 text-red-400" data-testid="message-status-failed" />;
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
                className="bg-background border-gray-700 p-3"
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
            className="ml-1 p-0.5 rounded hover:bg-white/10 transition-colors"
            title="Retry sending"
          >
            <RefreshCw className="h-3 w-3 text-red-400 hover:text-foreground" />
          </button>
        )}
      </div>
      {/* Error message for failed sends */}
      {isOwn && isFailed && message.error && (
        <p className="text-xs text-red-400 mt-1">{message.error}</p>
      )}
    </>
  );
}
