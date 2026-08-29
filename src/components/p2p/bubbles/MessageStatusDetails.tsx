import type { P2PMessage } from '@/lib/p2p';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { interactive } from '@/lib/a11y';
import { formatPreciseDateTime } from '@/lib/format-time';

interface MessageStatusDetailsProps {
  message: P2PMessage;
}

const statusLabels: Record<P2PMessage['status'], string> = {
  pending: 'Enqueued (waiting to send)',
  sent: 'Sent to server',
  delivered: 'Delivered to peer',
  read: 'Seen by peer',
  failed: 'Failed to send'
};

const statusColors: Record<P2PMessage['status'], string> = {
  pending: 'text-muted-foreground',
  sent: 'text-foreground/80',
  delivered: 'text-success-emphasis',
  read: 'text-primary-accent',
  failed: 'text-destructive'
};


function truncateCid(cid: string): string {
  if (!cid) return 'N/A';
  if (cid.length <= 16) return cid;
  return `${cid.slice(0, 10)}...${cid.slice(-4)}`;
}

function truncateId(id: string): string {
  if (!id) return 'N/A';
  if (id.length <= 8) return id;
  return id.slice(0, 8);
}

interface RowProps {
  label: string;
  value: string;
  valueClassName?: string;
  copyable?: boolean;
  fullValue?: string;
}

function Row({ label, value, valueClassName = 'text-foreground', copyable, fullValue }: RowProps) {
  const handleCopy = (): void => {
    runAsyncSetup(async () => {
      await navigator.clipboard.writeText(fullValue || value);
    });
  };

  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}:</span>
      <span
        className={`font-mono ${valueClassName} ${copyable ? 'cursor-pointer hover:underline' : ''}`}
        // Only interactive when it is actually copyable: giving a non-copyable
        // value role="button" and a tab stop would put it in the tab order and
        // announce it as actionable when nothing happens on activation.
        {...(copyable ? interactive(handleCopy) : {})}
        title={copyable ? `Click to copy: ${fullValue || value}` : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export function MessageStatusDetails({ message }: MessageStatusDetailsProps) {
  return (
    <div className="space-y-1 text-xs min-w-[200px]">
      <div className="font-semibold text-foreground border-b border-border pb-1 mb-2">
        Message Details
      </div>
      <Row
        label="Status"
        value={statusLabels[message.status]}
        valueClassName={statusColors[message.status]}
      />
      <Row
        label="Sent"
        value={formatPreciseDateTime(message.timestamp)}
      />
      <Row
        label="ID"
        value={truncateId(message.id)}
        fullValue={message.id}
        copyable
      />
      <Row
        label="From"
        value={truncateCid(message.senderCid.toString())}
        fullValue={message.senderCid.toString()}
        copyable
      />
      <Row
        label="To"
        value={truncateCid(message.recipientCid.toString())}
        fullValue={message.recipientCid.toString()}
        copyable
      />
      {message.error && (
        <Row
          label="Error"
          value={message.error}
          valueClassName="text-destructive"
        />
      )}
    </div>
  );
}
