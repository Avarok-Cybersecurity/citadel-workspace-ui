/**
 * P2PChat Component
 *
 * Main P2P chat interface supporting text, markdown, live documents, and file transfers.
 * Uses extracted hooks and components for message handling, input, and display.
 */

import { FilePreviewDialog } from '@/components/layout/sidebar/FilePreviewDialog';
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
import { useConnectionRoute } from './hooks/use-connection-route';
import { useSupervisorState } from './hooks/use-supervisor-state';
import { useChatInterest } from './hooks/use-chat-interest';
import type { SupervisorState } from '@/types/agent-supervisor';
import type { PeerPathReport } from '@/types/ice-servers';
import { useStickToBottom, type StickToBottom } from '@/components/chat/use-stick-to-bottom';
import { useCatchUpRead } from './hooks/use-catch-up-read';
import { NewMessagesPill } from '@/components/chat/NewMessagesPill';
import { usePeerPause, type PeerPauseBinding } from './hooks/use-peer-pause';
import { PausedBanner } from './PausedBanner';
import { callCapabilityWhile } from '@/lib/p2p-pause/pause-copy';
import { useScreenshotNotice, sendScreenshotNotice } from './hooks/useScreenshotNotice';
import type { DirectCallBinding } from '@/components/p2p/hooks/use-direct-call';

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
}: P2PChatProps): JSX.Element {
  // Hooks first, before any early return in this component. Placing them lower
  // put them after one, which breaks React's hook ordering and fails
  // intermittently at runtime rather than reliably.
  const callBinding: DirectCallBinding = useDirectCall(peerCid, peerName);

  const isGroupMode: boolean = mode === 'group';
  useScreenshotNotice(isGroupMode ? null : peerCid, sendScreenshotNotice); // best effort: see screenshot-detection.ts
  const displaySenderName: boolean = showSenderName ?? isGroupMode;
  const displaySenderAvatar: boolean = showSenderAvatar ?? isGroupMode;

  const scrollRef: React.RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
  const pinnedRef: React.MutableRefObject<boolean> = useRef<boolean>(true); // the reader is at the bottom

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
    isLoadingMore, isLoadingHistory, hasMorePages, handleScroll, handleRetryMessage,
    handleEditMessage, handleDeleteMessage, handleReactMessage,
  } = useP2PMessages({
    peerCid, activeTabIdRef, scrollRef, pinnedRef,
    onUnreadMessage: useCallback(() => setMessagesHasUnread(true), [setMessagesHasUnread]),
  });

  const fileTransfer: ReturnType<typeof useP2PFileTransfer> = useP2PFileTransfer({ peerCid, peerName });
  const connectionRoute: PeerPathReport | null = useConnectionRoute(currentUserCid ?? null, peerCid);
  const supervisor: SupervisorState | null = useSupervisorState(currentUserCid ?? null, peerCid);
  useChatInterest(currentUserCid ?? null, peerCid);

  // Composition hook (input, reply/edit context, send, live-doc flow)
  const {
    inputRef, inputMessage, setInputMessage, isSending,
    messageType, showDocModal, closeDocModal,
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

  const onCaughtUp: () => void = useCatchUpRead(peerCid, activeTabIdRef, pinnedRef);
  const stick: StickToBottom = useStickToBottom(scrollRef, messages, `Messages with ${peerName}`, (m) => m.senderCid === currentUserCid, { pinnedRef, onCaughtUp });

  // Paused: the link is down on purpose. Messages still send and queue; calls
  // and files need the live link, so those say why they are unavailable.
  const pause: PeerPauseBinding = usePeerPause(peerCid);
  const paused: boolean = pause.status === 'paused';

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

  const isViewingDocument: boolean = activeTab?.type === 'live_document';


  return (
    <div className="h-full flex flex-col bg-background" data-testid="p2p-chat">
      <P2PChatHeader
        peerName={peerName}
        peerPresence={peerPresence}
        peerTyping={peerTyping}
        isConnected={isConnected}
        isRegistered={isRegistered}
        paused={paused}
        connectionRoute={connectionRoute}
        supervisor={supervisor}
        onSettingsClick={() => setShowSettingsModal(true)}
        call={{
          canCall: isConnected,
          inCall: callBinding.active,
          capability: callCapabilityWhile(pause.status, callBinding.capability),
          onStartCall: callBinding.startCall,
          onLeave: callBinding.leave,
        }}
      />
      {paused && <PausedBanner busy={pause.busy} onResume={pause.resume} />}

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
          <LiveDocumentView documentId={activeTab.documentId} documentTitle={activeTab.title} peerCid={peerCid.toString()} peerName={peerName} linkUp={isConnected} currentUserCid={currentUserCid?.toString() || ''} currentUserName={currentUserName} />
        ) : (
          <>
            <div className="relative flex min-h-0 flex-1 flex-col">
            <P2PMessageList
              ref={scrollRef} messages={messages} currentUserCid={currentUserCid}
              currentUserName={currentUserName} peerName={peerName} peerCid={peerCid}
              isLoadingMore={isLoadingMore} isLoadingHistory={isLoadingHistory} hasMorePages={hasMorePages}
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
              focusComposer={(): void => { inputRef.current?.focus(); }}
              onReactMessage={handleReactMessage}
            />
            <NewMessagesPill count={stick.unseen} onView={stick.reveal} />
            </div>
            <ComposeContextBanner
              replyingTo={replyingTo}
              editingMessage={editingMessage}
              onCancel={cancelComposeContext}
            />
            <P2PMessageInput
              ref={inputRef} inputMessage={inputMessage} messageType={messageType}
              showMarkdownPreview={showMarkdownPreview} canSendMessages={true} paused={paused} isSending={isSending}
              onInputChange={setInputMessage} onInputFocus={handleInputFocus}
              onInputBlur={handleInputBlur} onSubmit={handleSendMessage}
              onFileClick={() => setShowFileModal(true)} onFormat={applyFormat}
              onTogglePreview={() => setShowMarkdownPreview(prev => !prev)}
              onMessageTypeChange={handleMessageTypeChange}
            />
          </>
        )}
      </div>

      <LiveDocumentModal isOpen={showDocModal} onClose={closeDocModal} onCreateDocument={handleDocCreate} initialContent={inputMessage} />
      <FileTransferModal isOpen={showFileModal} onClose={() => setShowFileModal(false)} onSendFile={fileTransfer.handleSendFile} peerCid={peerCid.toString()} />
      <FilePreviewDialog file={fileTransfer.openedFile} isOpen={fileTransfer.openedFile !== null} onClose={fileTransfer.closeOpenedFile} />
      <ChatSettingsPanel isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} peerCid={peerCid.toString()} peerName={peerName} />
    </div>
  );
}
