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
  // Tokens, not literal white. Light mode is a shipped, user-selectable theme,
  // and `--surface` there is 96% lightness — so `bg-surface text-white` put white
  // on near-white at roughly 1.08:1. A light-mode user whose message failed to
  // send could not read what they had tried to say. `bg-primary text-white`
  // happened to look right only because --primary is dark in both themes.
  if (isOwn) {
    return isFailed
      ? 'bg-surface text-foreground border border-destructive/30'
      : 'bg-primary text-primary-foreground';
  }
  return 'bg-surface text-foreground';
}

export function getBubbleContainerStyles(isOwn: boolean): string {
  return `flex ${isOwn ? 'justify-end' : 'justify-start'}`;
}

/**
 * How wide a message bubble may get.
 *
 * One constant because bubbles in the SAME thread stopped at two different right
 * edges depending on their content: text and markdown at 80%, file transfers and
 * live documents at 70%. Group messages used a third value for identical text.
 * Nothing decided that — it is what happens when a number is retyped at each
 * site.
 */
export const BUBBLE_MAX_WIDTH = 'max-w-[75%]';
