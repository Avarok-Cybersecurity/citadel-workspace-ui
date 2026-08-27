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
      peerCid: _peerCid,
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
        {/*
        role="log" carries an implicit aria-live="polite" and
        aria-relevant="additions", which is the pattern for a running
        transcript: a message that arrives while you are elsewhere on the
        page gets announced instead of sitting there silently. Without it
        the core feature of the app was invisible to a screen reader until
        the user went looking, and axe reports nothing — a live region is
        not required markup, it is a decision nobody had made.
        */}
        <div className="space-y-4" role="log" aria-label="Conversation">
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
          {messages.length === 0 && !isLoadingMore && (
            // The group chat view has had this since it was written; the P2P
            // one rendered an empty div, so the first conversation a new user
            // opens -- the product's core flow -- was a blank void that reads
            // as a screen that failed to load.
            <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
              <p className="text-sm text-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground">
                Say hello to {peerName}. Messages are end-to-end encrypted.
              </p>
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
