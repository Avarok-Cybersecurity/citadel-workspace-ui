import type { P2PMessage } from '@/lib/p2p';

export interface BaseBubbleProps {
  message: P2PMessage;
  isOwn: boolean;
  onRetry?: () => void;

  // Group mode display options
  showSenderName?: boolean;     // Show sender name above message (group mode)
  showSenderAvatar?: boolean;   // Show avatar for other users' messages
  senderName?: string;          // Display name for sender

  // Message actions (group mode)
  onEdit?: () => void;
  onDelete?: () => void;
  onReply?: () => void;
}

export interface LiveDocumentBubbleProps extends BaseBubbleProps {
  onOpenDocument?: (documentId: string, documentTitle: string) => void;
}

export interface FileTransferBubbleProps extends BaseBubbleProps {
  onAccept?: (transferId: string) => void;
  onDecline?: (transferId: string) => void;
  onCancel?: (transferId: string) => void;
  onOpen?: (downloadPath: string) => void;
}

// Shared bubble styles
export function getBubbleStyles(isOwn: boolean, isFailed: boolean): string {
  if (isOwn) {
    return isFailed
      ? 'bg-[#4a3a5a] text-white border border-red-500/30'
      : 'bg-[#6E59A5] text-white';
  }
  return 'bg-[#262C4A] text-gray-100';
}

export function getBubbleContainerStyles(isOwn: boolean): string {
  return `flex ${isOwn ? 'justify-end' : 'justify-start'}`;
}
