import React, { useState, useEffect, useRef, useCallback } from 'react';
import { P2PMessengerManager } from '@/lib/p2p-messenger-manager';
import { p2pRegistrationService } from '@/lib/p2p-registration-service';
import { p2pAutoConnectService } from '@/lib/p2p-auto-connect-service';
import { eventEmitter } from '@/lib/event-emitter';
import { notificationService } from '@/lib/notification-service';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MessageBubble } from './bubbles';
import { ChatTabBar, ChatTab, MESSAGES_TAB, createLiveDocumentTab } from './ChatTabBar';
import { TypeSelectorBar } from './TypeSelectorBar';
import { MarkdownToolbar, useMarkdownFormat } from './MarkdownToolbar';
import ReactMarkdown from 'react-markdown';
import { LiveDocumentView } from './LiveDocumentView';
import { LiveDocumentModal } from './LiveDocumentModal';
import { liveDocumentStore } from '@/lib/live-document-store';
import type { P2PMessage, PeerPresence } from '@/lib/p2p-messenger-manager';
import { MessagingLayerType } from '@/types/messaging-layer';
import type { MessageType } from '@/types/message-protocol';

interface P2PChatProps {
  peerCid: string;
  peerName?: string;
  currentUserCid?: string;
  currentUserName?: string;
}

export function P2PChat({ peerCid, peerName = 'Peer', currentUserCid, currentUserName = 'You' }: P2PChatProps) {
  const [messages, setMessages] = useState<P2PMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerPresence, setPeerPresence] = useState<PeerPresence>({
    status: MessagingLayerType.Offline,
    lastUpdate: 0
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  // Tab system state
  const [tabs, setTabs] = useState<ChatTab[]>([MESSAGES_TAB]);
  const [activeTabId, setActiveTabId] = useState('messages');

  // Tab notification state
  const [messagesHasUnread, setMessagesHasUnread] = useState(false);
  const [tabActivity, setTabActivity] = useState<Record<string, boolean>>({});

  // Message type state
  const [messageType, setMessageType] = useState<MessageType>('text');

  // Live document modal state
  const [showDocModal, setShowDocModal] = useState(false);

  // Markdown preview state
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Ref to always have latest inputMessage available for polling callback
  const inputMessageRef = useRef(inputMessage);
  // Refs to fix stale closure issues in event handlers
  const activeTabIdRef = useRef(activeTabId);
  const tabsRef = useRef(tabs);

  // Markdown formatting hook
  const { applyFormat } = useMarkdownFormat(
    inputRef,
    setInputMessage,
    () => inputMessage
  );

  // Toast for error notifications
  const { toast } = useToast();

  const messenger = P2PMessengerManager.getInstance();

  // Can send messages if peer is registered (P2P connection is optional)
  const canSendMessages = isRegistered || isConnected;

  // Keep refs in sync with state (fixes stale closure issues)
  useEffect(() => {
    inputMessageRef.current = inputMessage;
  }, [inputMessage]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  
  // Handle demo peer messages
  const DEMO_MESSAGES: P2PMessage[] = peerCid === 'demo-peer-kathy' ? [
    {
      id: 'demo-1',
      senderCid: 'demo-peer-kathy',
      recipientCid: currentUserCid || 'user',
      content: 'Hey! How\'s the project going?',
      timestamp: Date.now() - 1000 * 60 * 5,
      index: 1,
      status: 'delivered',
      message_type: 'text'
    },
    {
      id: 'demo-2',
      senderCid: currentUserCid || 'user',
      recipientCid: 'demo-peer-kathy',
      content: 'It\'s going great! Just finishing up the P2P messaging feature.',
      timestamp: Date.now() - 1000 * 60 * 4,
      index: 2,
      status: 'delivered',
      message_type: 'text'
    },
    {
      id: 'demo-3',
      senderCid: 'demo-peer-kathy',
      recipientCid: currentUserCid || 'user',
      content: 'Awesome! Let me know if you need any help.',
      timestamp: Date.now() - 1000 * 60 * 3,
      index: 3,
      status: 'delivered',
      message_type: 'text'
    }
  ] : [];

  useEffect(() => {
    // Handle empty peer selection
    if (!peerCid) {
      setMessages([]);
      return;
    }

    // Load demo messages for demo peer
    if (peerCid === 'demo-peer-kathy') {
      setMessages(DEMO_MESSAGES);
      setIsConnected(true);
      setPeerPresence({ status: MessagingLayerType.Online, lastUpdate: Date.now() });
    } else {
      // Load existing conversation after LocalDB is ready
      const loadConversation = async () => {
        await messenger.waitForReady();

        // CRITICAL: Sync connections from backend BEFORE getting conversation
        // This ensures the presence status is accurate (handles page reload scenario)
        await messenger.syncConnectionsFromBackend();

        const conversation = messenger.getConversation(peerCid);
        if (conversation) {
          setMessages(conversation.messages);
          setPeerPresence(conversation.presence);

          // Also update isConnected based on synced state
          const syncedConnected = messenger.isConnected(peerCid);
          if (syncedConnected) {
            setIsConnected(true);
          }
        }

        // Double-check with p2pAutoConnectService as additional source
        const autoConnectConnected = p2pAutoConnectService.isPeerConnected(peerCid);
        if (autoConnectConnected) {
          setIsConnected(true);
          setPeerPresence({ status: MessagingLayerType.Online, lastUpdate: Date.now() });
        }
      };
      loadConversation();
    }

    // Subscribe to new messages
    const unsubscribeMessage = messenger.onMessage((message) => {
      if (message.senderCid === peerCid || message.recipientCid === peerCid) {
        setMessages(prev => {
          // Deduplication: Check if message already exists by ID
          if (prev.some(m => m.id === message.id)) {
            return prev;  // Don't add duplicate
          }
          return [...prev, message];
        });

        // If this is an incoming message from the peer (not our own sent message),
        // mark it as read ONLY if the tab is currently visible (user can actually see it)
        if (message.senderCid === peerCid && peerCid !== 'demo-peer-kathy') {
          // Check if we're NOT on the messages tab - show notification dot
          // Use ref to get current value (fixes stale closure bug)
          if (activeTabIdRef.current !== 'messages') {
            setMessagesHasUnread(true);
          }

          if (document.visibilityState === 'visible' && activeTabIdRef.current === 'messages') {
            messenger.markMessagesAsRead(peerCid, [message.id]).catch(error => {
              console.error('Failed to mark message as read:', error);
            });
          }
          // If tab is not visible, the message will be marked as read when:
          // 1. User switches to this tab (via visibilitychange listener below)
          // 2. Or when conversation is re-opened
        }
      }
    });

    // Subscribe to message status changes (for read receipts)
    const unsubscribeStatusChange = messenger.onMessageStatusChange((messageId, status) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, status } : m
      ));
    });

    // Subscribe to typing indicators
    const unsubscribeTyping = messenger.onTyping((cid, isTyping) => {
      if (cid === peerCid) {
        setPeerTyping(isTyping);
      }
    });

    // Subscribe to connection status
    const unsubscribeConnection = messenger.onConnectionChange((cid, connected) => {
      if (cid === peerCid) {
        setIsConnected(connected);
      }
    });

    // Subscribe to presence updates
    const unsubscribePresence = messenger.onPresenceChange((cid, presence) => {
      if (cid === peerCid) {
        setPeerPresence(presence);
      }
    });

    // Subscribe to peer registration events (enables input when peer registers with us)
    const unsubscribeRegistration = eventEmitter.on('p2p:peer-registered', ({ peer }: { peer: { cid: string } }) => {
      if (peer.cid === peerCid) {
        setIsRegistered(true);
        // Wake up auto-connect service to check for new peers to connect to
        p2pAutoConnectService.poll();
      }
    });

    // Check initial connection status from multiple sources
    const initialConnected = messenger.isConnected(peerCid) || p2pAutoConnectService.isPeerConnected(peerCid);
    setIsConnected(initialConnected);

    // Check initial registration status
    setIsRegistered(p2pRegistrationService.isPeerRegistered(peerCid));

    // Mark messages as read when conversation is viewed (only if tab is visible)
    if (peerCid !== 'demo-peer-kathy' && document.visibilityState === 'visible') {
      messenger.markMessagesAsRead(peerCid).catch(error => {
        console.error('Failed to mark messages as read:', error);
      });
    }

    // Listen for tab visibility changes - mark messages as read when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && peerCid !== 'demo-peer-kathy') {
        messenger.markMessagesAsRead(peerCid).catch(error => {
          console.error('Failed to mark messages as read on visibility change:', error);
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribeMessage();
      unsubscribeStatusChange();
      unsubscribeTyping();
      unsubscribeConnection();
      unsubscribePresence();
      unsubscribeRegistration();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Stop typing polling when unmounting or changing peer
      messenger.stopTypingPolling(peerCid);
    };
  }, [peerCid]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Listen for raw P2P messages to detect yjs_sync for tab activity indicators
  // This works even when CollaborativeEditor is not mounted (user on Messages tab)
  useEffect(() => {
    const handleRawMessage = ({ peerCid, message }: { peerCid: string; message: string }) => {
      try {
        const parsed = JSON.parse(message);
        // Check if it's a yjs_sync message (document edit from peer)
        if (parsed.type === 'yjs_sync' && parsed.document_id) {
          const documentId = parsed.document_id;
          // Find the tab with this document ID
          // Use refs to get current values (fixes stale closure bug)
          const tab = tabsRef.current.find(t => t.documentId === documentId);
          if (tab && activeTabIdRef.current !== tab.id) {
            // Tab is not active, show activity indicator
            setTabActivity(prev => ({ ...prev, [tab.id]: true }));
          }
        }
      } catch (e) {
        // Not a JSON message or not a yjs message, ignore
      }
    };

    eventEmitter.on('p2p:raw-message', handleRawMessage);
    return () => {
      eventEmitter.off('p2p:raw-message', handleRawMessage);
    };
  }, []); // Empty deps - refs handle the updates

  // Handle tab selection with notification clearing
  const handleTabSelect = useCallback((tabId: string) => {
    setActiveTabId(tabId);

    // Clear unread indicator for messages tab
    if (tabId === 'messages') {
      setMessagesHasUnread(false);
    }

    // Clear activity indicator for the selected tab
    setTabActivity(prev => ({ ...prev, [tabId]: false }));
  }, []);

  // Build tabs with hasUnread property
  const tabsWithUnread = tabs.map(tab => ({
    ...tab,
    hasUnread: tab.id === 'messages' ? messagesHasUnread : tabActivity[tab.id] || false,
  }));

  // Mark notifications as read when viewing a conversation
  // This auto-decrements the notification bell count
  useEffect(() => {
    if (peerCid && peerCid !== 'demo-peer-kathy' && activeTabId === 'messages') {
      // Mark message notifications from this peer as read
      notificationService.markMessageNotificationsAsReadBySender(peerCid);
    }
  }, [peerCid, activeTabId]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    // If live document type is selected, open the modal instead
    if (messageType === 'live_document') {
      setShowDocModal(true);
      return;
    }

    // Stop typing polling when sending
    messenger.stopTypingPolling(peerCid);

    try {
      await messenger.sendMessage(peerCid, inputMessage, { messageType });
      setInputMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to send message',
        description: 'Check your connection and try again.',
      });
    }
  };

  // Handle opening a live document (from clicking a bubble)
  const handleOpenDocument = useCallback((docId: string, title: string) => {
    // Check if tab already exists
    const existingTab = tabs.find(t => t.documentId === docId);
    if (existingTab) {
      setActiveTabId(existingTab.id);
    } else {
      // Create new tab
      const newTab = createLiveDocumentTab(docId, title);
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
  }, [tabs]);

  // Handle creating a new live document
  const handleCreateDocument = useCallback(async (title: string, initialContent: string) => {
    if (!currentUserCid) return;

    try {
      // Create document in store
      const metadata = await liveDocumentStore.createDocument(title, peerCid);

      // Send a live document message to the peer
      await messenger.sendMessage(peerCid, `Created live document: ${title}`, {
        messageType: 'live_document',
        documentId: metadata.id,
        documentTitle: title,
      });

      // Open the document tab
      handleOpenDocument(metadata.id, title);
      setShowDocModal(false);
      setInputMessage('');
    } catch (error) {
      console.error('Failed to create live document:', error);
    }
  }, [peerCid, currentUserCid, handleOpenDocument]);

  // Handle closing a document tab
  const handleCloseTab = useCallback((tabId: string) => {
    setTabs(prev => prev.filter(t => t.id !== tabId));
    // If closing the active tab, switch to messages
    if (activeTabId === tabId) {
      setActiveTabId('messages');
    }
  }, [activeTabId]);

  // Handle message type change
  const handleMessageTypeChange = useCallback((type: MessageType) => {
    setMessageType(type);
    // If switching to live document, open modal immediately if there's content
    if (type === 'live_document' && inputMessage.trim()) {
      setShowDocModal(true);
    }
  }, [inputMessage]);

  // Start typing polling when input is focused
  const handleInputFocus = useCallback(() => {
    if (peerCid && peerCid !== 'demo-peer-kathy') {
      messenger.startTypingPolling(peerCid, () => inputMessageRef.current);
    }
  }, [peerCid, messenger]);

  // Stop typing polling when input loses focus
  const handleInputBlur = useCallback(() => {
    if (peerCid) {
      messenger.stopTypingPolling(peerCid);
    }
  }, [peerCid, messenger]);

  // Retry sending a failed message
  const handleRetryMessage = useCallback(async (message: P2PMessage) => {
    if (message.status !== 'failed') return;
    try {
      await messenger.resendMessage(peerCid, message.id);
    } catch (error) {
      console.error('Failed to retry message:', error);
    }
  }, [peerCid, messenger]);

  // Helper to get combined status display with priority:
  // 1. P2P connected -> "Online" (green)
  // 2. Registered -> "Registered" (blue)
  // 3. Otherwise use presence status
  const getStatusDisplay = (presence: PeerPresence, connected: boolean, registered: boolean) => {
    // Priority 1: P2P connected always shows as Online
    if (connected) {
      return { text: 'Online', color: 'bg-green-500', textColor: 'text-green-400' };
    }

    // Priority 2: Registered but not connected
    if (registered) {
      return { text: 'Registered', color: 'bg-blue-500', textColor: 'text-blue-400' };
    }

    // Priority 3: Fall back to presence status
    switch (presence.status) {
      case MessagingLayerType.Online:
        return { text: 'Online', color: 'bg-green-500', textColor: 'text-green-400' };
      case MessagingLayerType.Away:
        return { text: 'Away', color: 'bg-yellow-500', textColor: 'text-yellow-400' };
      case MessagingLayerType.Offline:
        return { text: 'Offline', color: 'bg-gray-400', textColor: 'text-gray-400' };
      case MessagingLayerType.CustomState:
        return {
          text: presence.customText || 'Custom',
          color: presence.customColor ? undefined : 'bg-purple-500',
          textColor: 'text-purple-400',
          customColor: presence.customColor
        };
      default:
        return { text: 'Offline', color: 'bg-gray-400', textColor: 'text-gray-400' };
    }
  };

  // Show placeholder when no peer is selected
  if (!peerCid) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#1C1D28]">
        <MessageCircle className="h-12 w-12 text-gray-400 mb-4" />
        <p className="text-gray-500">Select a conversation to start messaging</p>
      </div>
    );
  }

  const statusDisplay = getStatusDisplay(peerPresence, isConnected, isRegistered);

  // Get the active tab for live document view
  const activeTab = tabs.find(t => t.id === activeTabId);
  const isViewingDocument = activeTab?.type === 'live_document';

  return (
    <div className="h-full flex flex-col bg-[#1C1D28]">
      {/* Header */}
      <div className="border-b border-[#262C4A]/50 p-4 bg-[#1a1b26]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{peerName[0]}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-base font-semibold text-white">{peerName}</h3>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div
                  className={`h-2 w-2 rounded-full ${statusDisplay.color || ''}`}
                  style={statusDisplay.customColor ? { backgroundColor: statusDisplay.customColor } : undefined}
                />
                <span className={statusDisplay.textColor}>{statusDisplay.text}</span>
                {peerTyping && (
                  <span className="ml-2 text-purple-400 animate-pulse">typing...</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <ChatTabBar
        tabs={tabsWithUnread}
        activeTabId={activeTabId}
        onTabSelect={handleTabSelect}
        onTabClose={handleCloseTab}
      />

      {/* Content Area - Messages or Live Document */}
      <div className="flex-1 p-0 flex flex-col overflow-hidden">
        {isViewingDocument && activeTab?.documentId ? (
          <LiveDocumentView
            documentId={activeTab.documentId}
            documentTitle={activeTab.title}
            peerCid={peerCid}
            peerName={peerName}
            currentUserCid={currentUserCid || ''}
            currentUserName={currentUserName}
          />
        ) : (
          <>
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((message) => {
                  const isOwn = message.senderCid === currentUserCid;
                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isOwn={isOwn}
                      onRetry={() => handleRetryMessage(message)}
                      onOpenDocument={handleOpenDocument}
                    />
                  );
                })}
              </div>
            </ScrollArea>

            {/* Input Area - only shown when viewing messages */}
            <div className="border-t border-[#262C4A]/50 bg-[#1a1b26]">
              {/* Markdown Toolbar - animated */}
              <MarkdownToolbar
                visible={messageType === 'markdown'}
                onFormat={applyFormat}
                showPreview={showMarkdownPreview}
                onTogglePreview={() => setShowMarkdownPreview(prev => !prev)}
              />

              {/* Markdown Preview Pane */}
              {messageType === 'markdown' && showMarkdownPreview && inputMessage.trim() && (
                <div className="p-4 border-b border-[#262C4A]/50 bg-[#1C1D28]">
                  <p className="text-xs text-gray-400 mb-2">Preview:</p>
                  <div className="prose prose-sm prose-invert max-w-none bg-[#262C4A] rounded-lg p-3 max-h-32 overflow-y-auto">
                    <ReactMarkdown>{inputMessage}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Message Input */}
              <div className="p-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex gap-2"
                >
                  <Input
                    ref={inputRef}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    placeholder={
                      messageType === 'markdown'
                        ? 'Type markdown message...'
                        : messageType === 'live_document'
                        ? 'Document content (optional)...'
                        : 'Type a message...'
                    }
                    disabled={!canSendMessages}
                    className="flex-1 bg-[#262C4A] border-[#3a3f5c] text-white placeholder-gray-400 focus:border-[#6E59A5]"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!canSendMessages || (!inputMessage.trim() && messageType !== 'live_document')}
                    className="bg-[#6E59A5] hover:bg-[#7c68d6] text-white"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>

              {/* Type Selector Bar */}
              <TypeSelectorBar
                selectedType={messageType}
                onTypeChange={handleMessageTypeChange}
                disabled={!canSendMessages}
              />
            </div>
          </>
        )}
      </div>

      {/* Live Document Modal */}
      <LiveDocumentModal
        isOpen={showDocModal}
        onClose={() => setShowDocModal(false)}
        onCreateDocument={handleCreateDocument}
        initialContent={inputMessage}
      />
    </div>
  );
}