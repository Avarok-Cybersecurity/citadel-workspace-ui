/**
 * P2PChat Component
 *
 * Main P2P chat interface supporting text, markdown, live documents, and file transfers.
 * Uses extracted hooks and components for message handling, input, and display.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { P2PMessengerManager } from '@/lib/p2p';
import { eventEmitter } from '@/lib/event-emitter';
import { notificationService } from '@/lib/notification-service';
import { MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ChatTabBar, ChatTab, MESSAGES_TAB, createLiveDocumentTab } from './ChatTabBar';
import { useMarkdownFormat } from './MarkdownToolbar';
import { LiveDocumentView } from './LiveDocumentView';
import { LiveDocumentModal } from './LiveDocumentModal';
import { FileTransferModal } from './FileTransferModal';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { liveDocumentStore } from '@/lib/live-document-store';
import { P2PChatHeader } from './P2PChatHeader';
import { P2PMessageList } from './P2PMessageList';
import { P2PMessageInput } from './P2PMessageInput';
import { useP2PMessages, useP2PFileTransfer } from './hooks';
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
  groupId,
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

  // Input state
  const [inputMessage, setInputMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputMessageRef = useRef(inputMessage);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tab system state
  const [tabs, setTabs] = useState<ChatTab[]>([MESSAGES_TAB]);
  const [activeTabId, setActiveTabId] = useState('messages');
  const [messagesHasUnread, setMessagesHasUnread] = useState(false);
  const [tabActivity, setTabActivity] = useState<Record<string, boolean>>({});
  const activeTabIdRef = useRef(activeTabId);
  const tabsRef = useRef(tabs);

  // Message type and modal state
  const [messageType, setMessageType] = useState<MessageType>('text');
  const [showDocModal, setShowDocModal] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);

  const { toast } = useToast();
  const messenger = P2PMessengerManager.getInstance();

  // Markdown formatting hook
  const applyFormat = useMarkdownFormat(inputRef, setInputMessage, () => inputMessage);

  // Messages hook
  const {
    messages,
    peerTyping,
    peerPresence,
    isConnected,
    isRegistered,
    isLoadingMore,
    hasMorePages,
    handleScroll,
    handleRetryMessage,
  } = useP2PMessages({
    peerCid,
    activeTabIdRef,
    scrollRef,
    onUnreadMessage: useCallback(() => setMessagesHasUnread(true), []),
  });

  // File transfer hook
  const fileTransfer = useP2PFileTransfer({ peerCid, peerName });

  // Keep refs in sync
  useEffect(() => { inputMessageRef.current = inputMessage; }, [inputMessage]);
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Listen for raw P2P messages to detect yjs_sync for tab activity
  useEffect(() => {
    const handleRawMessage = ({ peerCid: rawPeerCid, message }: { peerCid: string; message: Uint8Array }) => {
      try {
        const decoded = new TextDecoder().decode(message);
        const parsed = JSON.parse(decoded);
        if (parsed.type === 'yjs_sync' && parsed.document_id) {
          const tab = tabsRef.current.find(t => t.documentId === parsed.document_id);
          if (tab && activeTabIdRef.current !== tab.id) {
            setTabActivity(prev => ({ ...prev, [tab.id]: true }));
          }
        }
      } catch (e) { /* Not a JSON/yjs message */ }
    };
    eventEmitter.on('p2p:raw-message', handleRawMessage);
    return () => { eventEmitter.off('p2p:raw-message', handleRawMessage); };
  }, []);

  // Mark notifications as read when viewing conversation
  useEffect(() => {
    if (peerCid && activeTabId === 'messages') {
      notificationService.markMessageNotificationsAsReadBySender(peerCid.toString());
    }
  }, [peerCid, activeTabId]);

  // Tab handlers
  const handleTabSelect = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    if (tabId === 'messages') setMessagesHasUnread(false);
    setTabActivity(prev => ({ ...prev, [tabId]: false }));
  }, []);

  const handleCloseTab = useCallback((tabId: string) => {
    setTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) setActiveTabId('messages');
  }, [activeTabId]);

  const tabsWithUnread = tabs.map(tab => ({
    ...tab,
    hasUnread: tab.id === 'messages' ? messagesHasUnread : tabActivity[tab.id] || false,
  }));

  // Message sending
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    if (messageType === 'live_document') {
      setShowDocModal(true);
      return;
    }
    messenger.stopTypingPolling(peerCid);
    try {
      await messenger.sendMessage(peerCid, inputMessage, { messageType });
      setInputMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({ variant: 'destructive', title: 'Failed to send message', description: 'Check your connection and try again.' });
    }
  };

  // Document handlers
  const handleOpenDocument = useCallback((docId: string, title: string) => {
    const existingTab = tabs.find(t => t.documentId === docId);
    if (existingTab) {
      setActiveTabId(existingTab.id);
    } else {
      const newTab = createLiveDocumentTab(docId, title);
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
  }, [tabs]);

  const handleCreateDocument = useCallback(async (title: string, initialContent: string) => {
    if (!currentUserCid) return;
    try {
      const metadata = await liveDocumentStore.createDocument(title, peerCid.toString(), currentUserCid.toString());
      await messenger.sendMessage(peerCid, `Created live document: ${title}`, {
        messageType: 'live_document',
        documentId: metadata.id,
        documentTitle: title,
      });
      handleOpenDocument(metadata.id, title);
      setShowDocModal(false);
      setInputMessage('');
    } catch (error) {
      console.error('Failed to create live document:', error);
    }
  }, [peerCid, currentUserCid, handleOpenDocument]);

  // Input handlers
  const handleMessageTypeChange = useCallback((type: MessageType) => {
    setMessageType(type);
    if (type === 'live_document' && inputMessage.trim()) setShowDocModal(true);
  }, [inputMessage]);

  const handleInputFocus = useCallback(() => {
    if (peerCid) messenger.startTypingPolling(peerCid, () => inputMessageRef.current);
  }, [peerCid]);

  const handleInputBlur = useCallback(() => {
    if (peerCid) messenger.stopTypingPolling(peerCid);
  }, [peerCid]);

  // Placeholder when no peer selected
  if (!peerCid) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#1C1D28]">
        <MessageCircle className="h-12 w-12 text-gray-400 mb-4" />
        <p className="text-gray-500">Select a conversation to start messaging</p>
      </div>
    );
  }

  const activeTab = tabs.find(t => t.id === activeTabId);
  const isViewingDocument = activeTab?.type === 'live_document';

  return (
    <div className="h-full flex flex-col bg-[#1C1D28]">
      <P2PChatHeader
        peerName={peerName}
        peerPresence={peerPresence}
        peerTyping={peerTyping}
        isConnected={isConnected}
        isRegistered={isRegistered}
        onSettingsClick={() => setShowSettingsModal(true)}
      />

      <ChatTabBar
        tabs={tabsWithUnread}
        activeTabId={activeTabId}
        onTabSelect={handleTabSelect}
        onTabClose={handleCloseTab}
      />

      {rules && (
        <div className="px-4 py-2 bg-purple-900/30 border-b border-purple-800/50">
          <p className="text-sm text-purple-300">{rules}</p>
        </div>
      )}

      <div className="flex-1 p-0 flex flex-col overflow-hidden">
        {isViewingDocument && activeTab?.documentId ? (
          <LiveDocumentView
            documentId={activeTab.documentId}
            documentTitle={activeTab.title}
            peerCid={peerCid.toString()}
            peerName={peerName}
            currentUserCid={currentUserCid?.toString() || ''}
            currentUserName={currentUserName}
          />
        ) : (
          <>
            <P2PMessageList
              ref={scrollRef}
              messages={messages}
              currentUserCid={currentUserCid}
              currentUserName={currentUserName}
              peerName={peerName}
              peerCid={peerCid}
              isLoadingMore={isLoadingMore}
              hasMorePages={hasMorePages}
              displaySenderName={displaySenderName}
              displaySenderAvatar={displaySenderAvatar}
              onScroll={handleScroll}
              onRetryMessage={handleRetryMessage}
              onOpenDocument={handleOpenDocument}
              onAcceptTransfer={fileTransfer.handleAcceptTransfer}
              onDeclineTransfer={fileTransfer.handleDeclineTransfer}
              onCancelTransfer={fileTransfer.handleCancelTransfer}
              onOpenFile={fileTransfer.handleOpenFile}
              onEditMessage={onEditMessage}
              onDeleteMessage={onDeleteMessage}
              onReplyMessage={onReplyMessage}
            />
            <P2PMessageInput
              ref={inputRef}
              inputMessage={inputMessage}
              messageType={messageType}
              showMarkdownPreview={showMarkdownPreview}
              canSendMessages={true}
              onInputChange={setInputMessage}
              onInputFocus={handleInputFocus}
              onInputBlur={handleInputBlur}
              onSubmit={handleSendMessage}
              onFileClick={() => setShowFileModal(true)}
              onFormat={applyFormat}
              onTogglePreview={() => setShowMarkdownPreview(prev => !prev)}
              onMessageTypeChange={handleMessageTypeChange}
            />
          </>
        )}
      </div>

      <LiveDocumentModal
        isOpen={showDocModal}
        onClose={() => setShowDocModal(false)}
        onCreateDocument={handleCreateDocument}
        initialContent={inputMessage}
      />
      <FileTransferModal
        isOpen={showFileModal}
        onClose={() => setShowFileModal(false)}
        onSendFile={fileTransfer.handleSendFile}
        peerCid={peerCid.toString()}
      />
      <ChatSettingsPanel
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        peerCid={peerCid.toString()}
        peerName={peerName}
      />
    </div>
  );
}
