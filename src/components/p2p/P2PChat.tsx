/**
 * P2PChat Component
 *
 * Main P2P chat interface supporting text, markdown, live documents, and file transfers.
 * Uses extracted hooks and components for message handling, input, and display.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { P2PMessengerManager } from '@/lib/p2p/p2p-messenger-manager';
import type { P2PMessage } from '@/lib/p2p/p2p-types';
import { notificationService } from '@/lib/notification-service';
import { MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debug-config';
import { ChatTabBar } from './ChatTabBar';
import { ComposeContextBanner } from './ComposeContextBanner';
import { useMarkdownFormat } from './MarkdownToolbar';
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
import type { MessageType } from '@/types/message-protocol';

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

  const [inputMessage, setInputMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputMessageRef = useRef(inputMessage);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messageType, setMessageType] = useState<MessageType>('text');
  const [showDocModal, setShowDocModal] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);

  const { toast } = useToast();
  const messenger = P2PMessengerManager.getInstance();
  const applyFormat = useMarkdownFormat(inputRef, setInputMessage, () => inputMessage);

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

  useEffect(() => { inputMessageRef.current = inputMessage; }, [inputMessage]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Mark notifications as read when viewing conversation
  useEffect(() => {
    if (peerCid && activeTabId === 'messages') {
      notificationService.markMessageNotificationsAsReadBySender(peerCid.toString());
    }
  }, [peerCid, activeTabId]);

  // The message this composition is replying to, if any. Cleared on send and on
  // explicit cancel, so a reply cannot silently attach itself to a later message.
  const [replyingTo, setReplyingTo] = useState<P2PMessage | null>(null);

  // The message being edited. The bubble's Edit action hands us the CURRENT
  // content, so it cannot be an edit on its own — it loads the message into the
  // composer and the next submit commits the change.
  const [editingMessage, setEditingMessage] = useState<P2PMessage | null>(null);

  const handleReplyMessage = useCallback((messageId: string) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target) return;
    setEditingMessage(null);
    setReplyingTo(target);
    inputRef.current?.focus();
  }, [messages]);

  const handleStartEdit = useCallback((messageId: string, content: string) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target) return;
    setReplyingTo(null);
    setEditingMessage(target);
    setInputMessage(content);
    inputRef.current?.focus();
  }, [messages]);

  const cancelComposeContext = useCallback(() => {
    if (editingMessage) setInputMessage('');
    setEditingMessage(null);
    setReplyingTo(null);
  }, [editingMessage]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    if (messageType === 'live_document') { setShowDocModal(true); return; }
    messenger.stopTypingPolling(peerCid);
    try {
      if (editingMessage) {
        await handleEditMessage(editingMessage.id, inputMessage);
        setEditingMessage(null);
        setInputMessage('');
        return;
      }
      await messenger.sendMessage(peerCid, inputMessage, {
        messageType,
        replyTo: replyingTo?.id,
      });
      setInputMessage('');
      setReplyingTo(null);
    } catch (error) {
      debugLog('P2PChat', 'Failed to send message:', error);
      toast({ variant: 'destructive', title: 'Failed to send message', description: 'Check your connection and try again.' });
    }
  };

  const handleDocCreate = useCallback(async (title: string, initialContent: string) => {
    await handleCreateDocument(title, initialContent);
    setShowDocModal(false);
    setInputMessage('');
  }, [handleCreateDocument]);

  const handleMessageTypeChange = useCallback((type: MessageType) => {
    setMessageType(type);
    if (type === 'live_document' && inputMessage.trim()) setShowDocModal(true);
  }, [inputMessage]);

  const handleInputFocus = useCallback(() => {
    if (peerCid) messenger.startTypingPolling(peerCid, () => inputMessageRef.current);
  }, [peerCid, messenger]);

  const handleInputBlur = useCallback(() => {
    if (peerCid) messenger.stopTypingPolling(peerCid);
  }, [peerCid, messenger]);

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
          remoteAudioStreams={callBinding.remoteAudioStreams}
          duration={callBinding.duration}
          onToggleMic={callBinding.toggleMic}
          onToggleCamera={callBinding.toggleCamera}
          onLeave={callBinding.leave}
        />
      )}
      <ChatTabBar tabs={tabsWithUnread} activeTabId={activeTabId} onTabSelect={handleTabSelect} onTabClose={handleCloseTab} />

      {rules && (
        <div className="px-4 py-2 bg-purple-900/30 border-b border-purple-800/50">
          <p className="text-sm text-purple-300">{rules}</p>
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
              showMarkdownPreview={showMarkdownPreview} canSendMessages={true}
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
