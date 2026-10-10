/**
 * GroupMessageFooter Component
 *
 * Displays read indicators for group messages:
 * - Single check (gray): Message sent
 * - Double check (amber/yellow): Some members have read (partial)
 * - Double check (blue): All members have read
 *
 * Includes a details card showing who has viewed when not all members have seen it.
 */

import { Check, CheckCheck } from 'lucide-react';
import { GroupMessage, GroupMessageReadBy } from '@/types/workspace-entities';
import { formatTime } from './shared';
import { useId, useState } from 'react';
import { StatusPanel, StatusTick } from '@/components/shared/StatusDetails';

interface GroupMessageFooterProps {
  message: GroupMessage;
  isOwn: boolean;
  /** Total number of members in the group, sender included; null when the roster is not known. */
  totalMembers: number | null;
}

type ReadStatus = 'sent' | 'partial' | 'all_read';

const READ_STATUS_LABEL: Record<ReadStatus, string> = {
  sent: 'Sent',
  partial: 'Seen by some members',
  all_read: 'Seen by everyone',
};

export function getReadStatus(message: GroupMessage, totalMembers: number | null): ReadStatus {
  const readBy: GroupMessageReadBy[] = message.read_by || [];
  const readCount: number = readBy.length;

  if (readCount === 0) {
    return 'sent';
  }

  // All members (excluding sender) have read
  if (totalMembers !== null && readCount >= totalMembers - 1) {
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
      // Blue, as the comment always said; it was primary-accent, which is purple.
      return <CheckCheck className="h-3.5 w-3.5 text-read-receipt" strokeWidth={2.5} data-testid="message-status-all-read" aria-label="Seen by everyone" />;
    default:
      return null;
  }
}

interface ReadByDetailsProps {
  readBy: GroupMessageReadBy[];
  totalMembers: number | null;
  status: ReadStatus;
}

export function ReadByDetails({ readBy, totalMembers, status }: ReadByDetailsProps): JSX.Element {
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
    // Without the roster there is nobody to count against; say who has seen it and stop.
    const others: number | null = totalMembers === null ? null : totalMembers - 1;
    const unreadCount: number = others === null ? 0 : others - readBy.length;
    return (
      <div className="text-sm max-w-[200px]">
        <p className="text-warning-emphasis font-medium mb-2">
          {others === null ? `Seen by ${readBy.length}` : `Seen by ${readBy.length} of ${others}`}
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
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const panelId: string = useId();

  return (
    <>
    <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <span className="text-xs opacity-70" data-testid="message-timestamp">
        {formatTime(message.timestamp)}
      </span>
      {message.edited_at != null && (
        <span className="text-xs text-muted-foreground italic">(edited)</span>
      )}
      {isOwn && statusIcon && (
        <StatusTick label={READ_STATUS_LABEL[status]} open={detailsOpen} onToggle={() => setDetailsOpen(!detailsOpen)} panelId={panelId}>
          {statusIcon}
        </StatusTick>
      )}
    </div>
    {isOwn && statusIcon && detailsOpen && (
      <div className="flex justify-end">
        <StatusPanel id={panelId}>
          <ReadByDetails readBy={readBy} totalMembers={totalMembers} status={status} />
        </StatusPanel>
      </div>
    )}
    </>
  );
}

export default GroupMessageFooter;
