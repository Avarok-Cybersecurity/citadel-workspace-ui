/**
 * P2PChat Component
 *
 * Main P2P chat interface supporting text, markdown, live documents, and file transfers.
 * Uses extracted hooks and components for message handling, input, and display.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { notificationService } from '@/lib/notification-service';
import { ChatTabBar } from './ChatTabBar';
import { NoConversation } from './NoConversation';
import { ComposeContextBanner } from './ComposeContextBanner';
import { LiveDocumentPane } from './LiveDocumentPane';
import { LiveDocumentModal } from './LiveDocumentModal';
import { ChatFileDialogs } from './ChatFileDialogs';
import { useChatFileSend, type ChatFileSend } from './hooks/use-chat-file-send';
import { ChatDropTarget } from './ChatDropTarget';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { P2PChatHeader } from './P2PChatHeader';
import { CallStage } from '@/components/call/CallStage';
import { useDirectCall } from './hooks/use-direct-call';
import { P2PMessageList } from './P2PMessageList';
import { P2PMessageInput } from './P2PMessageInput';
import { useP2PMessages, useP2PTabs } from './hooks';
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
  /** The roster key behind `peerName`. Absent when the caller only knows a display name; the picture then falls back to initials. */
  peerUsername?: string;
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
  peerUsername,
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

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  // Tabs hook
  const {
    activeTabId, activeTabIdRef, tabsWithUnread, activeTab,
    setMessagesHasUnread, handleTabSelect, handleCloseTab,
    handleOpenDocument, handleCreateDocument, handleRenameDocument,
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
  const fileSend: ChatFileSend = useChatFileSend({ peerCid, peerName, viewingDocument: activeTab?.type === 'live_document', paused });

  // Mark notifications as read when viewing conversation
  useEffect(() => {
    if (peerCid && activeTabId === 'messages') {
      notificationService.markMessageNotificationsAsReadBySender(peerCid.toString());
    }
  }, [peerCid, activeTabId]);

  if (!peerCid) return <NoConversation />;

  const isViewingDocument: boolean = activeTab?.type === 'live_document';


  return (
    <ChatDropTarget className="h-full flex flex-col bg-background" testId="p2p-chat" peerName={peerName} {...fileSend.drop}>
      <P2PChatHeader
        peerName={peerName}
        peerUsername={peerUsername ?? peerName}
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
      <ChatTabBar tabs={tabsWithUnread} activeTabId={activeTabId} onTabSelect={handleTabSelect} onTabClose={handleCloseTab} onTabRename={handleRenameDocument} />

      {rules && (
        <div className="px-4 py-2 bg-primary/20 border-b border-primary/40">
          <p className="text-sm text-primary-accent">{rules}</p>
        </div>
      )}

      <div className="flex-1 p-0 flex flex-col overflow-hidden">
        {isViewingDocument && activeTab?.documentId ? (
          <LiveDocumentPane documentId={activeTab.documentId} documentTitle={activeTab.title} onRename={handleRenameDocument} peerCid={peerCid.toString()} peerName={peerName} linkUp={isConnected} currentUserCid={currentUserCid?.toString() || ''} currentUserName={currentUserName} />
        ) : (
          <>
            <div className="relative flex min-h-0 flex-1 flex-col">
            <P2PMessageList
              ref={scrollRef} messages={messages} currentUserCid={currentUserCid}
              currentUserName={currentUserName} peerName={peerName} peerUsername={peerUsername ?? peerName} peerCid={peerCid}
              isLoadingMore={isLoadingMore} isLoadingHistory={isLoadingHistory} hasMorePages={hasMorePages}
              displaySenderName={displaySenderName} displaySenderAvatar={displaySenderAvatar}
              onScroll={handleScroll} onRetryMessage={handleRetryMessage}
              onOpenDocument={handleOpenDocument}
              onAcceptTransfer={fileSend.fileTransfer.handleAcceptTransfer}
              onDeclineTransfer={fileSend.fileTransfer.handleDeclineTransfer}
              onCancelTransfer={fileSend.fileTransfer.handleCancelTransfer}
              onOpenFile={fileSend.fileTransfer.handleOpenFile}
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
              showMarkdownPreview={showMarkdownPreview} paused={paused} isSending={isSending}
              onInputChange={setInputMessage} onInputFocus={handleInputFocus}
              onInputBlur={handleInputBlur} onSubmit={handleSendMessage}
              onFileClick={fileSend.openDialog} onFormat={applyFormat}
              onTogglePreview={() => setShowMarkdownPreview(prev => !prev)}
              onMessageTypeChange={handleMessageTypeChange}
            />
          </>
        )}
      </div>

      <LiveDocumentModal isOpen={showDocModal} onClose={closeDocModal} onCreateDocument={handleDocCreate} initialContent={inputMessage} />
      <ChatFileDialogs send={fileSend} peerCid={peerCid} />
      <ChatSettingsPanel isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} peerCid={peerCid.toString()} peerName={peerName} />
    </ChatDropTarget>
  );
}
