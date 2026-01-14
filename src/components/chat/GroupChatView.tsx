/**
 * GroupChatView Component
 *
 * Displays group chat messages for an office or room chat channel.
 * Supports real-time updates, pagination, threading, and message actions.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Send, MoreVertical, Edit2, Trash2, Reply, Loader2 } from 'lucide-react';
import { GroupMessage, GroupMessageType } from '@/types/workspace-entities';
import { GroupMessageTypeTS } from '@/types/workspace-protocol';
import WorkspaceService from '@/lib/workspace-service';
import { groupMessagingManager, GroupMessageEvent } from '@/lib/group-messaging-manager';
import { cn } from '@/lib/utils';
import { getInitials, groupMessagesByDate } from './shared';
import { GroupMessageFooter } from './GroupMessageFooter';

interface GroupChatViewProps {
  groupId: string;
  currentUserId: string;
  currentUserName: string;
  rules?: string;
  /** Total number of members in this group (for read receipts) */
  totalMembers?: number;
}

interface MessageItemProps {
  message: GroupMessage;
  currentUserId: string;
  totalMembers: number;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReply: (messageId: string) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({
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

        {/* Read indicator footer - replaces inline time/edited display */}
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

export const GroupChatView: React.FC<GroupChatViewProps> = ({
  groupId,
  currentUserId,
  currentUserName,
  rules,
  totalMembers = 2, // Default to 2 for basic chat
}) => {
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);

  const [inputValue, setInputValue] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Load initial messages
  useEffect(() => {
    const loadMessages = async () => {
      setLoading(true);
      try {
        await WorkspaceService.getGroupMessages(groupId);
      } catch (error) {
        console.error('Failed to load messages:', error);
        toast({
          title: 'Failed to load messages',
          description: 'Please try again later.',
          variant: 'destructive',
        });
      }
    };

    loadMessages();
  }, [groupId, toast]);

  // Subscribe to group message events
  useEffect(() => {
    const unsubscribe = groupMessagingManager.subscribeToGroup(groupId, (event) => {
      switch (event.type) {
        case 'messages_loaded':
          setMessages(event.messages || []);
          setHasMore(event.hasMore || false);
          setLoading(false);
          setLoadingMore(false);
          break;
        case 'new_message':
          if (event.message) {
            setMessages((prev) => {
              // Check for duplicates by message ID
              const exists = prev.some((m) => m.id === event.message!.id);
              if (exists) {
                console.log('[GroupChatView] Skipping duplicate message:', event.message!.id);
                return prev;
              }
              return [...prev, event.message!];
            });
            // Scroll to bottom for new messages
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }
          break;
        case 'message_edited':
          setMessages((prev) =>
            prev.map((m) =>
              m.id === event.messageId
                ? { ...m, content: event.message?.content || m.content, edited_at: event.message?.edited_at }
                : m
            )
          );
          break;
        case 'message_deleted':
          setMessages((prev) => prev.filter((m) => m.id !== event.messageId));
          break;
      }
    });

    return () => unsubscribe();
  }, [groupId]);

  // Load more messages (pagination)
  const loadMoreMessages = useCallback(async () => {
    if (!hasMore || loadingMore) return;

    const oldestTimestamp = groupMessagingManager.getOldestTimestamp(groupId);
    if (!oldestTimestamp) return;

    setLoadingMore(true);
    try {
      await WorkspaceService.getGroupMessages(groupId, oldestTimestamp);
    } catch (error) {
      console.error('Failed to load more messages:', error);
      setLoadingMore(false);
    }
  }, [groupId, hasMore, loadingMore]);

  // Handle send message
  const handleSendMessage = async () => {
    if (!inputValue.trim() || sending) return;

    setSending(true);
    try {
      await WorkspaceService.sendGroupMessage(
        groupId,
        inputValue.trim(),
        GroupMessageTypeTS.Text,
        replyToId || undefined
      );
      setInputValue('');
      setReplyToId(null);
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        title: 'Failed to send message',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  // Handle edit message
  const handleEditMessage = async () => {
    if (!editingId || !editContent.trim()) return;

    try {
      await WorkspaceService.editGroupMessage(groupId, editingId, editContent.trim());
      setEditingId(null);
      setEditContent('');
    } catch (error) {
      console.error('Failed to edit message:', error);
      toast({
        title: 'Failed to edit message',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle delete message
  const handleDeleteMessage = async (messageId: string) => {
    try {
      await WorkspaceService.deleteGroupMessage(groupId, messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
      toast({
        title: 'Failed to delete message',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Group messages by date using shared utility
  const messagesByDate = groupMessagesByDate(messages);

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editingId) {
        handleEditMessage();
      } else {
        handleSendMessage();
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Rules banner */}
      {rules && (
        <div className="px-4 py-2 bg-purple-900/30 border-b border-purple-800/50">
          <p className="text-sm text-purple-300">{rules}</p>
        </div>
      )}

      {/* Messages area */}
      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          </div>
        ) : (
          <div className="py-4">
            {/* Load more button */}
            {hasMore && (
              <div className="flex justify-center mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMoreMessages}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Load older messages
                </Button>
              </div>
            )}

            {/* Messages grouped by date */}
            {Object.entries(messagesByDate).map(([date, dateMessages]) => (
              <div key={date}>
                <div className="flex items-center justify-center my-4">
                  <div className="h-px bg-gray-700 flex-1" />
                  <span className="px-3 text-xs text-gray-500">{date}</span>
                  <div className="h-px bg-gray-700 flex-1" />
                </div>
                {dateMessages.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    currentUserId={currentUserId}
                    totalMembers={totalMembers}
                    onEdit={(id, content) => {
                      setEditingId(id);
                      setEditContent(content);
                    }}
                    onDelete={handleDeleteMessage}
                    onReply={(id) => setReplyToId(id)}
                  />
                ))}
              </div>
            ))}

            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                <p className="text-lg">No messages yet</p>
                <p className="text-sm">Be the first to send a message!</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Reply indicator */}
      {replyToId && (
        <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 flex items-center justify-between">
          <span className="text-sm text-gray-400">
            Replying to message...
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReplyToId(null)}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Edit indicator */}
      {editingId && (
        <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 flex items-center justify-between">
          <span className="text-sm text-gray-400">
            Editing message...
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingId(null);
              setEditContent('');
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <Textarea
            value={editingId ? editContent : inputValue}
            onChange={(e) =>
              editingId
                ? setEditContent(e.target.value)
                : setInputValue(e.target.value)
            }
            onKeyDown={handleKeyPress}
            placeholder={editingId ? 'Edit message...' : 'Type a message...'}
            className="flex-1 resize-none bg-gray-800 border-gray-700 focus:border-purple-500"
            rows={1}
          />
          <Button
            onClick={editingId ? handleEditMessage : handleSendMessage}
            disabled={sending || (editingId ? !editContent.trim() : !inputValue.trim())}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GroupChatView;
