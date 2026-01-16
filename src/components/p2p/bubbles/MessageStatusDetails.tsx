import type { P2PMessage } from '@/lib/p2p-messenger-manager';

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
  pending: 'text-gray-400',
  sent: 'text-gray-300',
  delivered: 'text-green-400',
  read: 'text-sky-400',
  failed: 'text-red-400'
};

function formatFullDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour12: false
  });
}

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

function Row({ label, value, valueClassName = 'text-gray-200', copyable, fullValue }: RowProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(fullValue || value);
  };

  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}:</span>
      <span
        className={`font-mono ${valueClassName} ${copyable ? 'cursor-pointer hover:underline' : ''}`}
        onClick={copyable ? handleCopy : undefined}
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
      <div className="font-semibold text-gray-200 border-b border-gray-600 pb-1 mb-2">
        Message Details
      </div>
      <Row
        label="Status"
        value={statusLabels[message.status]}
        valueClassName={statusColors[message.status]}
      />
      <Row
        label="Sent"
        value={formatFullDateTime(message.timestamp)}
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
          valueClassName="text-red-400"
        />
      )}
    </div>
  );
}
