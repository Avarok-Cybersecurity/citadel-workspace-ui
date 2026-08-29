import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MoreVertical, Edit2, Trash2, Reply } from 'lucide-react';
import type { GroupMessage } from '@/types/workspace-entities';
import { cn } from '@/lib/utils';
import { getInitials } from './shared';
import { GroupMessageFooter } from './GroupMessageFooter';
import { BUBBLE_MAX_WIDTH } from '@/components/p2p/bubbles/types';

interface GroupMessageItemProps {
  message: GroupMessage;
  /**
   * The workspace USERNAME — what the server puts in `sender_id`.
   *
   * `currentUserId` (the CID) used to be passed here and compared against
   * `sender_id`, which can never match. It is gone rather than underscore-
   * hidden: an unused prop that looks like an identity invites the next person
   * to compare against it again.
   */
  currentUserName: string;
  totalMembers: number;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReply: (messageId: string) => void;
}

export const GroupMessageItem: React.FC<GroupMessageItemProps> = ({
  message,
  currentUserName,
  totalMembers,
  onEdit,
  onDelete,
  onReply,
}) => {
  // Compared against the USERNAME, not the CID.
  //
  // The server sets `sender_id` from `get_username_by_cid`, so it is a workspace
  // username — while `currentUserId` is `String(connectionInfo.cid)`. A username
  // can never equal a decimal CID, so this was ALWAYS false: Edit and Delete are
  // gated on it and never rendered for anyone, and your own messages rendered
  // left-aligned as if someone else had sent them.
  //
  // Fixed here rather than by changing `currentUserId`, which is genuinely a CID
  // at three other sites in GroupChatPage — call-member filtering and a
  // `BigInt()` conversion — and would break if it became a username.
  //
  // Guarded against the 'You' fallback: `currentUserName` defaults to that when
  // the connection has no username yet, and a message from a user actually
  // called "You" must not be mistaken for the reader's own.
  const isOwnMessage: boolean = Boolean(currentUserName) && currentUserName !== 'You'
    ? message.sender_id === currentUserName
    : false;
  const initials: string = getInitials(message.sender_name);

  return (
    <div className={cn(
      'group flex gap-3 px-4 py-2 hover:bg-accent/50 transition-colors',
      isOwnMessage && 'flex-row-reverse'
    )}>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className={cn('flex flex-col', BUBBLE_MAX_WIDTH, isOwnMessage && 'items-end')}>
        <div className={cn(
          'flex items-center gap-2 mb-1',
          isOwnMessage && 'flex-row-reverse'
        )}>
          <span className="text-sm font-medium text-foreground/80">
            {message.sender_name}
          </span>
        </div>

        <div className={cn(
          'rounded-lg px-3 py-2 text-sm',
          // `bg-surface`, matching the P2P bubble, not `bg-muted`. The two
          // surfaces used visibly different greys for the same thing -- 17% vs
          // 22% lightness in dark mode -- and P2P's choice is the one carrying
          // a documented reason (see p2p/bubbles/types.ts on the light-mode
          // contrast failure that produced it).
          isOwnMessage
            ? 'bg-primary text-primary-foreground'
            : 'bg-surface text-foreground'
        )}>
          {message.reply_to && (
            <div className="text-xs text-muted-foreground mb-1 border-l-2 border-border pl-2">
              Replying to a message
            </div>
          )}
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>

        <GroupMessageFooter
          message={message}
          isOwn={isOwnMessage}
          totalMembers={totalMembers}
        />

        {message.reply_count > 0 && (
          /* Text, not a button.
           *
           * This was a <button> in the accent colour with a hover state: it
           * took keyboard focus, was announced as a button, and did nothing at
           * all — there is no `onClick`, and nothing in this app renders or
           * opens a thread. `onReply` composes a NEW reply, which is not what
           * "3 replies" offers, so wiring it there would have been worse than
           * leaving it dead.
           *
           * The count is worth showing; the promise is not. Same call as the
           * "Invite User" button that used to sit under "No users found" —
           * pretending to a capability this app does not have.
           *
           * (Its hover was `hover:text-primary-accent` over a base of
           * `text-primary-accent`, so it did not change on hover either. Two
           * things that looked interactive and were not.)
           */
          <p className="text-xs text-muted-foreground mt-1" data-testid="group-reply-count">
            {message.reply_count} {message.reply_count === 1 ? 'reply' : 'replies'}
          </p>
        )}
      </div>

      {/* Message Actions */}
      <div className="reveal-on-hover flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="tap-target h-6 w-6" aria-label="Message actions">
              <MoreVertical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isOwnMessage ? 'start' : 'end'}>
            <DropdownMenuItem onClick={() => onReply(message.id)}>
              <Reply className="h-4 w-4 mr-2" />
              Reply
            </DropdownMenuItem>
            {isOwnMessage && (
              <>
                <DropdownMenuItem onClick={() => onEdit(message.id, message.content)}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(message.id)}
                  className="text-destructive-emphasis focus:text-destructive-emphasis"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
