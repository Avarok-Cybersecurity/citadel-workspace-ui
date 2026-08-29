/**
 * GroupMessageFooter Component
 *
 * Displays read indicators for group messages:
 * - Single check (gray): Message sent
 * - Double check (amber/yellow): Some members have read (partial)
 * - Double check (blue): All members have read
 *
 * Includes tooltip showing who has viewed when not all members have seen it.
 */

import { Check, CheckCheck } from 'lucide-react';
import { GroupMessage, GroupMessageReadBy } from '@/types/workspace-entities';
import { formatTime } from './shared';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface GroupMessageFooterProps {
  message: GroupMessage;
  isOwn: boolean;
  /** Total number of members in the group (excluding sender) */
  totalMembers: number;
}

type ReadStatus = 'sent' | 'partial' | 'all_read';

function getReadStatus(message: GroupMessage, totalMembers: number): ReadStatus {
  const readBy: GroupMessageReadBy[] = message.read_by || [];
  const readCount: number = readBy.length;

  if (readCount === 0) {
    return 'sent';
  }

  // All members (excluding sender) have read
  if (readCount >= totalMembers - 1) {
    return 'all_read';
  }

  return 'partial';
}

function getReadStatusIcon(status: ReadStatus): JSX.Element | null {
  switch (status) {
    case 'sent':
      return <Check className="h-3 w-3 text-muted-foreground" data-testid="message-status-sent" />;
    case 'partial':
      // Amber/yellow for partial reads
      return <CheckCheck className="h-3 w-3 text-warning-emphasis" data-testid="message-status-partial" />;
    case 'all_read':
      // Blue for all read
      return <CheckCheck className="h-3 w-3 text-primary-accent" data-testid="message-status-all-read" />;
    default:
      return null;
  }
}

interface ReadByTooltipContentProps {
  readBy: GroupMessageReadBy[];
  totalMembers: number;
  status: ReadStatus;
}

function ReadByTooltipContent({ readBy, totalMembers, status }: ReadByTooltipContentProps): JSX.Element {
  if (status === 'all_read') {
    return (
      <div className="text-sm">
        <p className="text-primary-accent font-medium">Read by everyone</p>
        <p className="text-xs text-muted-foreground mt-1">
          {readBy.length} member{readBy.length !== 1 ? 's' : ''}
        </p>
      </div>
    );
  }

  if (status === 'partial') {
    const unreadCount: number = (totalMembers - 1) - readBy.length;
    return (
      <div className="text-sm max-w-[200px]">
        <p className="text-warning-emphasis font-medium mb-2">
          Seen by {readBy.length} of {totalMembers - 1}
        </p>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Viewed by:</p>
          {readBy.map((reader) => (
            <div key={reader.user_id} className="flex items-center gap-2 text-xs">
              <span className="text-foreground/80">{reader.user_name}</span>
              <span className="text-muted-foreground">
                {formatTime(reader.read_at)}
              </span>
            </div>
          ))}
        </div>
        {unreadCount > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {unreadCount} member{unreadCount !== 1 ? 's' : ''} haven't seen this yet
          </p>
        )}
      </div>
    );
  }

  // Sent status
  return (
    <div className="text-sm">
      <p className="text-muted-foreground">Message sent</p>
      <p className="text-xs text-muted-foreground mt-1">Not yet read by anyone</p>
    </div>
  );
}

export function GroupMessageFooter({ message, isOwn, totalMembers }: GroupMessageFooterProps): JSX.Element {
  const readBy: GroupMessageReadBy[] = message.read_by || [];
  const status: ReadStatus = getReadStatus(message, totalMembers);
  const statusIcon: JSX.Element | null = getReadStatusIcon(status);

  return (
    <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <span className="text-xs opacity-70" data-testid="message-timestamp">
        {formatTime(message.timestamp)}
      </span>
      {message.edited_at != null && (
        <span className="text-xs text-muted-foreground italic">(edited)</span>
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
              <ReadByTooltipContent
                readBy={readBy}
                totalMembers={totalMembers}
                status={status}
              />
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

export default GroupMessageFooter;
