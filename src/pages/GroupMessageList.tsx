/**
 * GroupMessageList sub-component for GroupChatPage.
 * Renders the list of messages in a group chat.
 */

import { ScrollArea } from '@/components/ui/scroll-area';
import type { GroupMessage } from '@/types/group';

interface GroupMessageListProps {
  messages: GroupMessage[];
}

export function GroupMessageList({ messages }: GroupMessageListProps) {
  if (messages.length === 0) {
    return (
      <ScrollArea className="flex-1 p-4">
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p>No messages yet. Start the conversation!</p>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1 p-4">
      <div className="space-y-4">
        {messages.map(message => (
          <div
            key={message.id}
            className="flex items-start gap-3 group"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-primary-foreground bg-primary"
            >
              {message.senderName[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-foreground">
                  {message.senderName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm text-foreground/80">{message.content}</p>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
