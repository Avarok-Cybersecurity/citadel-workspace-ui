import { AlertCircle, MoreVertical, Reply, Edit2, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { getBubbleStyles, BUBBLE_MAX_WIDTH , type ReplyableBubbleProps } from './types';
import { ReplyQuote } from '@/components/chat/shared/ReplyQuote';
import { BubbleFooter } from './BubbleFooter';
import { ReactionChips } from '@/components/chat/shared/reactions/ReactionChips';
import { ReactionMenuItems } from '@/components/chat/shared/reactions/ReactionMenuItems';
import { getInitials } from '@/components/chat/shared';
import { RenderedMarkdown } from '@/components/chat/shared/RenderedMarkdown';
import { useMenuFocusHandoff, type MenuFocusHandoff } from '@/components/chat/shared/menu-focus-handoff';


export function MarkdownBubble({
  message,
  isOwn,
  onRetry,
  showSenderName,
  showSenderAvatar,
  senderName,
  onEdit,
  onDelete,
  onReply,
  focusComposer,
  quoted,
  reactions,
}: ReplyableBubbleProps): JSX.Element {
  const handoff: MenuFocusHandoff = useMenuFocusHandoff(focusComposer);
  const isFailed: boolean = message.status === 'failed';
  const bubbleStyles: string = getBubbleStyles(isOwn, isFailed);
  const displayName: string = senderName || 'Unknown';
  const hasActions: boolean = Boolean(onEdit || onDelete || onReply || reactions);

  // Show avatar only for non-own messages in group mode
  const shouldShowAvatar: boolean | undefined = showSenderAvatar && !isOwn;

  // min-w-0 down the chain — the fix TextBubble documents in detail and does
  // not itself need, because TextBubble renders plain text. THIS is the bubble
  // that renders <pre>, and an unbreakable code line widened the whole row past
  // the message list, with the pre's own overflow-x-auto inert because nothing
  // constrained its width.
  return (
    <div className={`group flex min-w-0 gap-2 ${BUBBLE_MAX_WIDTH} ${isOwn ? 'flex-row-reverse' : ''}`}>
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
          {message.replyTo && <ReplyQuote quoted={quoted} isOwn={isOwn} />}
          {/* Own bubbles invert UNCONDITIONALLY, because they are dark in both
              themes: `bg-primary text-primary-foreground`, and --primary is a
              dark purple in light mode too. `dark:prose-invert` alone meant that
              in light mode the typography plugin painted its own
              `color: hsl(var(--foreground))` — near-black — onto that dark
              purple, and links got `hsl(var(--primary))`, i.e. the bubble's own
              colour. Your own markdown messages were barely legible and their
              links were invisible, on the light theme only. Peer bubbles sit on
              `bg-surface` and correctly follow the theme.
              The typography plugin also paints a literal backtick either side
              of every `code`; in a chat bubble that is the markup showing, so
              it is switched off for both. */}
          <div
            className={`prose prose-sm max-w-none prose-code:before:content-none prose-code:after:content-none ${isOwn ? 'prose-invert' : 'dark:prose-invert'}`}
          >
            <RenderedMarkdown content={message.content} />
          </div>
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
        {reactions && <ReactionChips binding={reactions} isOwn={isOwn} />}
      </div>

      {/* Message Actions Dropdown */}
      {hasActions && (
        <div className="reveal-on-hover flex-shrink-0 self-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="tap-target h-6 w-6" aria-label="Message actions">
                <MoreVertical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwn ? 'start' : 'end'} onCloseAutoFocus={handoff.onCloseAutoFocus}>
              {onReply && (
                <DropdownMenuItem onClick={handoff.toComposer(onReply)}>
                  <Reply className="h-4 w-4 mr-2" />
                  Reply
                </DropdownMenuItem>
              )}
              {isOwn && onEdit && (
                <DropdownMenuItem onClick={handoff.toComposer(onEdit)}>
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
              {reactions && <ReactionMenuItems onReact={reactions.onReact} />}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
