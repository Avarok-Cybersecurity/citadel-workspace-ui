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
    <div className={`group flex gap-2 max-w-[80%] ${isOwn ? 'flex-row-reverse' : ''}`}>
      {/* Avatar for non-own messages */}
      {shouldShowAvatar && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="bg-primary text-foreground text-xs">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={`flex flex-col ${isOwn ? 'items-end' : ''}`}>
        {/* Sender name (group mode) */}
        {showSenderName && !isOwn && (
          <span className="text-xs text-muted-foreground mb-1 px-1">
            {displayName}
          </span>
        )}

        <div className={`rounded-lg px-3 py-2 ${bubbleStyles}`}>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          {/* Inline failure indicator */}
          {isOwn && isFailed && (
            <div className="flex items-center gap-1 mt-1.5 text-xs text-destructive">
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
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 self-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
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
                  className="text-destructive focus:text-destructive"
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
