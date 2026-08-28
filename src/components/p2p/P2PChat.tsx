/**
 * P2PChat Component
 *
 * Main P2P chat interface supporting text, markdown, live documents, and file transfers.
 * Uses extracted hooks and components for message handling, input, and display.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { notificationService } from '@/lib/notification-service';
import { MessageCircle } from 'lucide-react';
import { ChatTabBar } from './ChatTabBar';
import { ComposeContextBanner } from './ComposeContextBanner';
import { LiveDocumentView } from './LiveDocumentView';
import { LiveDocumentModal } from './LiveDocumentModal';
import { FileTransferModal } from './FileTransferModal';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { P2PChatHeader } from './P2PChatHeader';
import { CallStage } from '@/components/call/CallStage';
import { useDirectCall } from './hooks/use-direct-call';
import { P2PMessageList } from './P2PMessageList';
import { P2PMessageInput } from './P2PMessageInput';
import { useP2PMessages, useP2PFileTransfer, useP2PTabs } from './hooks';
import { useP2PCompose } from './hooks/useP2PCompose';

export type ChatMode = 'p2p' | 'group';

interface P2PChatProps {
  peerCid: bigint;
  peerName?: string;
  currentUserCid?: bigint;
  currentUserName?: string;
  mode?: ChatMode;
  groupId?: string;
  showSenderName?: boolean;
  showSenderAvatar?: boolean;
  rules?: string;
  onEditMessage?: (messageId: string, content: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onReplyMessage?: (messageId: string) => void;
}

export function P2PChat({
  peerCid,
  peerName = 'Peer',
  currentUserCid,
  currentUserName = 'You',
  mode = 'p2p',
  groupId: _groupId,
  showSenderName,
  showSenderAvatar,
  rules,
  onEditMessage,
  onDeleteMessage,
  onReplyMessage,
}: P2PChatProps) {
  // Hooks first, before any early return in this component. Placing them lower
  // put them after one, which breaks React's hook ordering and fails
  // intermittently at runtime rather than reliably.
  const callBinding = useDirectCall(peerCid, peerName);

  const isGroupMode = mode === 'group';
  const displaySenderName = showSenderName ?? isGroupMode;
  const displaySenderAvatar = showSenderAvatar ?? isGroupMode;

  const scrollRef = useRef<HTMLDivElement>(null);

  const [showFileModal, setShowFileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Tabs hook
  const {
    activeTabId, activeTabIdRef, tabsWithUnread, activeTab,
    setMessagesHasUnread, handleTabSelect, handleCloseTab,
    handleOpenDocument, handleCreateDocument,
  } = useP2PTabs({ peerCid, currentUserCid });

  // Messages hook
  const {
    messages, peerTyping, peerPresence, isConnected, isRegistered,
    isLoadingMore, hasMorePages, handleScroll, handleRetryMessage,
    handleEditMessage, handleDeleteMessage,
  } = useP2PMessages({
    peerCid, activeTabIdRef, scrollRef,
    onUnreadMessage: useCallback(() => setMessagesHasUnread(true), [setMessagesHasUnread]),
  });

  // File transfer hook
  const fileTransfer = useP2PFileTransfer({ peerCid, peerName });

  // Composition hook (input, reply/edit context, send, live-doc flow)
  const {
    inputRef, inputMessage, setInputMessage, isSending,
    messageType, showDocModal, setShowDocModal,
    showMarkdownPreview, setShowMarkdownPreview,
    applyFormat,
    replyingTo, editingMessage,
    handleReplyMessage, handleStartEdit, cancelComposeContext,
    handleSendMessage, handleDocCreate, handleMessageTypeChange,
    handleInputFocus, handleInputBlur,
  } = useP2PCompose({
    peerCid, messages,
    editMessage: handleEditMessage,
    createDocument: handleCreateDocument,
  });

  // Follow the conversation only when the reader is already at the bottom.
  //
  // This used to pin unconditionally on every change of `messages`, so someone
  // scrolled up reading yesterday's thread was yanked back down by any new
  // message — and, because the status subscription allocated a new array
  // regardless of whether the id was in THIS conversation, by any
  // sent/delivered/read transition anywhere in the messenger.
  //
  // It also fought the pagination anchoring in useP2PMessages, which goes to
  // real trouble to preserve scroll position across a prepend.
  const FOLLOW_THRESHOLD_PX = 80;
  const hasJumpedToLatest = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;

    // The first paint of a conversation must land on the newest message —
    // scrollTop is 0 there, so a pure "am I near the bottom" test would open
    // every conversation at the top of its history. P2PChat is keyed by peer,
    // so this ref resets when the conversation changes.
    if (!hasJumpedToLatest.current) {
      hasJumpedToLatest.current = true;
      el.scrollTop = el.scrollHeight;
      return;
    }

    const distanceFromBottom: number = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom <= FOLLOW_THRESHOLD_PX) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Mark notifications as read when viewing conversation
  useEffect(() => {
    if (peerCid && activeTabId === 'messages') {
      notificationService.markMessageNotificationsAsReadBySender(peerCid.toString());
    }
  }, [peerCid, activeTabId]);

  if (!peerCid) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background">
        <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Select a conversation to start messaging</p>
      </div>
    );
  }

  const isViewingDocument = activeTab?.type === 'live_document';


  return (
    <div className="h-full flex flex-col bg-background">
      <P2PChatHeader
        peerName={peerName}
        peerPresence={peerPresence}
        peerTyping={peerTyping}
        isConnected={isConnected}
        isRegistered={isRegistered}
        onSettingsClick={() => setShowSettingsModal(true)}
        call={{
          canCall: isConnected,
          inCall: callBinding.active,
          capability: callBinding.capability,
          onStartCall: callBinding.startCall,
          onLeave: callBinding.leave,
        }}
      />

      {/* Docked above the messages, so the conversation stays usable during a
          call — which is the entire reason to put calling inside a messenger. */}
      {callBinding.call && (
        <CallStage
          call={callBinding.call}
          selfUsername="You"
          localStream={callBinding.localStream}
          remoteStreams={callBinding.remoteStreams}
          remoteScreenStreams={callBinding.remoteScreenStreams}
          screenStream={callBinding.screenStream}
          qualities={callBinding.qualities}
          onToggleMic={callBinding.toggleMic}
          onToggleCamera={callBinding.toggleCamera}
          onToggleScreenShare={callBinding.toggleScreenShare}
          canShareScreen={callBinding.canShareScreen}
          onAnnotate={callBinding.annotate}
          videoQuality={callBinding.videoQuality}
          onVideoQualityChange={callBinding.setVideoQuality}
          onLeave={callBinding.leave}
        />
      )}
      <ChatTabBar tabs={tabsWithUnread} activeTabId={activeTabId} onTabSelect={handleTabSelect} onTabClose={handleCloseTab} />

      {rules && (
        <div className="px-4 py-2 bg-primary/20 border-b border-primary/40">
          <p className="text-sm text-primary-accent">{rules}</p>
        </div>
      )}

      <div className="flex-1 p-0 flex flex-col overflow-hidden">
        {isViewingDocument && activeTab?.documentId ? (
          <LiveDocumentView documentId={activeTab.documentId} documentTitle={activeTab.title} peerCid={peerCid.toString()} peerName={peerName} currentUserCid={currentUserCid?.toString() || ''} currentUserName={currentUserName} />
        ) : (
          <>
            <P2PMessageList
              ref={scrollRef} messages={messages} currentUserCid={currentUserCid}
              currentUserName={currentUserName} peerName={peerName} peerCid={peerCid}
              isLoadingMore={isLoadingMore} hasMorePages={hasMorePages}
              displaySenderName={displaySenderName} displaySenderAvatar={displaySenderAvatar}
              onScroll={handleScroll} onRetryMessage={handleRetryMessage}
              onOpenDocument={handleOpenDocument}
              onAcceptTransfer={fileTransfer.handleAcceptTransfer}
              onDeclineTransfer={fileTransfer.handleDeclineTransfer}
              onCancelTransfer={fileTransfer.handleCancelTransfer}
              onOpenFile={fileTransfer.handleOpenFile}
              onEditMessage={onEditMessage ?? handleStartEdit}
              onDeleteMessage={onDeleteMessage ?? handleDeleteMessage}
              onReplyMessage={onReplyMessage ?? handleReplyMessage}
            />
            <ComposeContextBanner
              replyingTo={replyingTo}
              editingMessage={editingMessage}
              onCancel={cancelComposeContext}
            />
            <P2PMessageInput
              ref={inputRef} inputMessage={inputMessage} messageType={messageType}
              showMarkdownPreview={showMarkdownPreview} canSendMessages={true} isSending={isSending}
              onInputChange={setInputMessage} onInputFocus={handleInputFocus}
              onInputBlur={handleInputBlur} onSubmit={handleSendMessage}
              onFileClick={() => setShowFileModal(true)} onFormat={applyFormat}
              onTogglePreview={() => setShowMarkdownPreview(prev => !prev)}
              onMessageTypeChange={handleMessageTypeChange}
            />
          </>
        )}
      </div>

      <LiveDocumentModal isOpen={showDocModal} onClose={() => setShowDocModal(false)} onCreateDocument={handleDocCreate} initialContent={inputMessage} />
      <FileTransferModal isOpen={showFileModal} onClose={() => setShowFileModal(false)} onSendFile={fileTransfer.handleSendFile} peerCid={peerCid.toString()} />
      <ChatSettingsPanel isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} peerCid={peerCid.toString()} peerName={peerName} />
    </div>
  );
}
