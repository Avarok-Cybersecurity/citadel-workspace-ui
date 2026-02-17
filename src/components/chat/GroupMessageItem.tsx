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

interface GroupMessageItemProps {
  message: GroupMessage;
  currentUserId: string;
  totalMembers: number;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReply: (messageId: string) => void;
}

export const GroupMessageItem: React.FC<GroupMessageItemProps> = ({
  message,
  currentUserId,
  totalMembers,
  onEdit,
  onDelete,
  onReply,
}) => {
  const isOwnMessage = message.sender_id === currentUserId;
  const initials = getInitials(message.sender_name);

  return (
    <div className={cn(
      'group flex gap-3 px-4 py-2 hover:bg-gray-800/50 transition-colors',
      isOwnMessage && 'flex-row-reverse'
    )}>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className="bg-purple-600 text-white text-xs">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className={cn('flex flex-col max-w-[70%]', isOwnMessage && 'items-end')}>
        <div className={cn(
          'flex items-center gap-2 mb-1',
          isOwnMessage && 'flex-row-reverse'
        )}>
          <span className="text-sm font-medium text-gray-300">
            {message.sender_name}
          </span>
        </div>

        <div className={cn(
          'rounded-lg px-3 py-2 text-sm',
          isOwnMessage
            ? 'bg-purple-600 text-white'
            : 'bg-gray-700 text-gray-100'
        )}>
          {message.reply_to && (
            <div className="text-xs text-gray-400 mb-1 border-l-2 border-gray-500 pl-2">
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
          <button className="text-xs text-purple-400 hover:text-purple-300 mt-1">
            {message.reply_count} {message.reply_count === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>

      {/* Message Actions */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <MoreVertical className="h-4 w-4 text-gray-400" />
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
                  className="text-red-400 focus:text-red-400"
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
