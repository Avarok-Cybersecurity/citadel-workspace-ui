/**
 * P2PChat Component
 *
 * Main P2P chat interface supporting text, markdown, live documents, and file transfers.
 * Uses extracted hooks and components for message handling, input, and display.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { P2PMessengerManager } from '@/lib/p2p/p2p-messenger-manager';
import { notificationService } from '@/lib/notification-service';
import { MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debug-config';
import { ChatTabBar } from './ChatTabBar';
import { useMarkdownFormat } from './MarkdownToolbar';
import { LiveDocumentView } from './LiveDocumentView';
import { LiveDocumentModal } from './LiveDocumentModal';
import { FileTransferModal } from './FileTransferModal';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { P2PChatHeader } from './P2PChatHeader';
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

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    if (messageType === 'live_document') { setShowDocModal(true); return; }
    messenger.stopTypingPolling(peerCid);
    try {
      await messenger.sendMessage(peerCid, inputMessage, { messageType });
      setInputMessage('');
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
      <P2PChatHeader peerName={peerName} peerPresence={peerPresence} peerTyping={peerTyping} isConnected={isConnected} isRegistered={isRegistered} onSettingsClick={() => setShowSettingsModal(true)} />
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
              onEditMessage={onEditMessage} onDeleteMessage={onDeleteMessage}
              onReplyMessage={onReplyMessage}
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
