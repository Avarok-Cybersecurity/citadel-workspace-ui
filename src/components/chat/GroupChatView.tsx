/**
 * GroupChatView Component
 *
 * Displays group chat messages for an office or room chat channel.
 * Supports real-time updates, pagination, threading, and message actions.
 */

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';
import { useGroupChat } from './useGroupChat';
import { GroupMessageItem } from './GroupMessageItem';

interface GroupChatViewProps {
  groupId: string;
  currentUserId: string;
  currentUserName: string;
  rules?: string;
  /** Total number of members in this group (for read receipts) */
  totalMembers?: number;
}

export const GroupChatView: React.FC<GroupChatViewProps> = ({
  groupId,
  currentUserId,
  currentUserName: _currentUserName,
  rules,
  totalMembers = 2,
}) => {
  const chat = useGroupChat(groupId);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Rules banner */}
      {rules && (
        <div className="px-4 py-2 bg-primary/20 border-b border-primary/40">
          <p className="text-sm text-primary-accent">{rules}</p>
        </div>
      )}

      {/* Messages area */}
      <ScrollArea className="flex-1" ref={chat.scrollAreaRef}>
        {chat.loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary-accent" />
          </div>
        ) : (
          <div className="py-4">
            {/* Load more button */}
            {chat.hasMore && (
              <div className="flex justify-center mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={chat.loadMoreMessages}
                  disabled={chat.loadingMore}
                >
                  {chat.loadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Load older messages
                </Button>
              </div>
            )}

            {/* Messages grouped by date */}
            {Object.entries(chat.messagesByDate).map(([date, dateMessages]) => (
              <div key={date}>
                <div className="flex items-center justify-center my-4">
                  <div className="h-px bg-gray-700 flex-1" />
                  <span className="px-3 text-xs text-muted-foreground">{date}</span>
                  <div className="h-px bg-gray-700 flex-1" />
                </div>
                {dateMessages.map((message) => (
                  <GroupMessageItem
                    key={message.id}
                    message={message}
                    currentUserId={currentUserId}
                    totalMembers={totalMembers}
                    onEdit={(id, content) => {
                      chat.setEditingId(id);
                      chat.setEditContent(content);
                    }}
                    onDelete={chat.handleDeleteMessage}
                    onReply={(id) => chat.setReplyToId(id)}
                  />
                ))}
              </div>
            ))}

            {chat.messages.length === 0 && !chat.loading && (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <p className="text-lg">No messages yet</p>
                <p className="text-sm">Be the first to send a message!</p>
              </div>
            )}

            <div ref={chat.messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Reply indicator */}
      {chat.replyToId && (
        <div className="px-4 py-2 bg-background border-t border-surface/50 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Replying to message...</span>
          <Button variant="ghost" size="sm" onClick={() => chat.setReplyToId(null)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Edit indicator */}
      {chat.editingId && (
        <div className="px-4 py-2 bg-background border-t border-surface/50 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Editing message...</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              chat.setEditingId(null);
              chat.setEditContent('');
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-surface/50">
        <div className="flex gap-2">
          <Textarea
            value={chat.editingId ? chat.editContent : chat.inputValue}
            onChange={(e) =>
              chat.editingId
                ? chat.setEditContent(e.target.value)
                : chat.setInputValue(e.target.value)
            }
            onKeyDown={chat.handleKeyPress}
            placeholder={chat.editingId ? 'Edit message...' : 'Type a message...'}
            className="flex-1 resize-none bg-background border-surface/50 focus:border-primary-accent"
            rows={1}
          />
          <Button
            onClick={chat.editingId ? chat.handleEditMessage : chat.handleSendMessage}
            disabled={chat.sending || (chat.editingId ? !chat.editContent.trim() : !chat.inputValue.trim())}
            className="bg-primary hover:bg-primary/90"
          >
            {chat.sending ? (
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
