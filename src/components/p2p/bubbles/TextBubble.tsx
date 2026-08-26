import { AlertCircle, MoreVertical, Reply, Edit2, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { getBubbleStyles } from './types';
import { BubbleFooter } from './BubbleFooter';
import { getInitials } from '@/components/chat/shared';
import type { BaseBubbleProps } from './types';

export function TextBubble({
  message,
  isOwn,
  onRetry,
  showSenderName,
  showSenderAvatar,
  senderName,
  onEdit,
  onDelete,
  onReply,
}: BaseBubbleProps) {
  const isFailed = message.status === 'failed';
  const bubbleStyles = getBubbleStyles(isOwn, isFailed);
  const displayName = senderName || 'Unknown';
  const hasActions = onEdit || onDelete || onReply;

  // Show avatar only for non-own messages in group mode
  const shouldShowAvatar = showSenderAvatar && !isOwn;

  return (
    // min-w-0 here and on the column below, or max-w-[80%] does not hold. A flex
    // item defaults to min-width:auto, and per spec min-width beats max-width —
    // so one unbreakable child (a <pre> of code, which does not wrap) widens the
    // whole row past the message list. Measured before the fix: a single long
    // code line produced a 762px bubble inside a 600px list, with the pre's
    // overflow-x-auto inert because nothing constrained its width.
    <div className={`group flex min-w-0 gap-2 max-w-[80%] ${isOwn ? 'flex-row-reverse' : ''}`}>
      {/* Avatar for non-own messages */}
      {shouldShowAvatar && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={`flex min-w-0 flex-col ${isOwn ? 'items-end' : ''}`}>
        {/* Sender name (group mode) */}
        {showSenderName && !isOwn && (
          <span className="text-xs text-muted-foreground mb-1 px-1">
            {displayName}
          </span>
        )}

        <div className={`min-w-0 rounded-lg px-3 py-2 ${bubbleStyles}`}>
          {/* break-words, like the group bubble beside it. `pre-wrap` only
              wraps at EXISTING opportunities, and a pasted URL or path has
              none — so it painted outside the bubble and was cut at the panel
              edge, unreadable and unselectable. The most common long string a
              chat user produces. */}
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          {/* Inline failure indicator */}
          {isOwn && isFailed && (
            <div className="flex items-center gap-1 mt-1.5 text-xs text-destructive-emphasis">
              <AlertCircle className="h-3 w-3" />
              <span>Failed to send</span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="underline hover:text-foreground transition-colors ml-1"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          <BubbleFooter message={message} isOwn={isOwn} onRetry={onRetry} />
        </div>
      </div>

      {/* Message Actions Dropdown */}
      {hasActions && (
        <div className="reveal-on-hover flex-shrink-0 self-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Message actions">
                <MoreVertical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwn ? 'start' : 'end'}>
              {onReply && (
                <DropdownMenuItem onClick={onReply}>
                  <Reply className="h-4 w-4 mr-2" />
                  Reply
                </DropdownMenuItem>
              )}
              {isOwn && onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {isOwn && onDelete && (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive-emphasis focus:text-destructive-emphasis"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
