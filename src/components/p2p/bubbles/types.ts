import type { P2PMessage } from '@/lib/p2p-messenger-manager';

export interface BaseBubbleProps {
  message: P2PMessage;
  isOwn: boolean;
  onRetry?: () => void;
}

export interface LiveDocumentBubbleProps extends BaseBubbleProps {
  onOpenDocument?: (documentId: string, documentTitle: string) => void;
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
