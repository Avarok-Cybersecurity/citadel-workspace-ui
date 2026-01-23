/**
 * P2PMessageList Component
 *
 * Renders the scrollable list of P2P messages with pagination support.
 */

import React, { forwardRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './bubbles';
import type { P2PMessage } from '@/lib/p2p';

interface P2PMessageListProps {
  messages: P2PMessage[];
  currentUserCid?: bigint;
  currentUserName: string;
  peerName: string;
  peerCid: bigint;
  isLoadingMore: boolean;
  hasMorePages: boolean;
  displaySenderName: boolean;
  displaySenderAvatar: boolean;
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  onRetryMessage: (message: P2PMessage) => void;
  onOpenDocument: (docId: string, title: string) => void;
  onAcceptTransfer: (transferId: string) => Promise<void>;
  onDeclineTransfer: (transferId: string) => Promise<void>;
  onCancelTransfer: (transferId: string) => Promise<void>;
  onOpenFile: (downloadPath: string) => void;
  onEditMessage?: (messageId: string, content: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onReplyMessage?: (messageId: string) => void;
}

export const P2PMessageList = forwardRef<HTMLDivElement, P2PMessageListProps>(
  function P2PMessageList(
    {
      messages,
      currentUserCid,
      currentUserName,
      peerName,
      peerCid,
      isLoadingMore,
      hasMorePages,
      displaySenderName,
      displaySenderAvatar,
      onScroll,
      onRetryMessage,
      onOpenDocument,
      onAcceptTransfer,
      onDeclineTransfer,
      onCancelTransfer,
      onOpenFile,
      onEditMessage,
      onDeleteMessage,
      onReplyMessage,
    },
    ref
  ) {
    return (
      <ScrollArea className="flex-1 p-4" ref={ref} onScroll={onScroll}>
        <div className="space-y-4">
          {isLoadingMore && (
            <div className="flex justify-center py-2">
              <div className="text-sm text-muted-foreground">Loading older messages...</div>
            </div>
          )}
          {hasMorePages && !isLoadingMore && (
            <div className="flex justify-center py-2">
              <div className="text-xs text-muted-foreground">↑ Scroll up for older messages</div>
            </div>
          )}
          {messages.map((message) => {
            const isOwn = message.senderCid === currentUserCid;
            const messageSenderName = isOwn ? currentUserName : peerName;

            return (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={isOwn}
                onRetry={() => onRetryMessage(message)}
                onOpenDocument={onOpenDocument}
                onAcceptTransfer={onAcceptTransfer}
                onDeclineTransfer={onDeclineTransfer}
                onCancelTransfer={onCancelTransfer}
                onOpenFile={onOpenFile}
                showSenderName={displaySenderName}
                showSenderAvatar={displaySenderAvatar}
                senderName={messageSenderName}
                onEdit={onEditMessage ? () => onEditMessage(message.id, message.content) : undefined}
                onDelete={onDeleteMessage ? () => onDeleteMessage(message.id) : undefined}
                onReply={onReplyMessage ? () => onReplyMessage(message.id) : undefined}
              />
            );
          })}
        </div>
      </ScrollArea>
    );
  }
);
