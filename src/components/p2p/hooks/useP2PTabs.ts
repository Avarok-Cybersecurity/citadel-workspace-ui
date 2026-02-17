/**
 * useP2PTabs Hook
 *
 * Manages the tab system for P2PChat: messages tab, live document tabs,
 * tab activity indicators, and tab open/close/select actions.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import { liveDocumentStore } from '@/lib/live-document-store';
import { P2PMessengerManager } from '@/lib/p2p';
import { debugLog } from '@/lib/debug-config';
import { ChatTab, MESSAGES_TAB, createLiveDocumentTab } from '../ChatTabBar';

interface UseP2PTabsOptions {
  peerCid: bigint;
  currentUserCid?: bigint;
}

export function useP2PTabs({ peerCid, currentUserCid }: UseP2PTabsOptions) {
  const [tabs, setTabs] = useState<ChatTab[]>([MESSAGES_TAB]);
  const [activeTabId, setActiveTabId] = useState('messages');
  const [messagesHasUnread, setMessagesHasUnread] = useState(false);
  const [tabActivity, setTabActivity] = useState<Record<string, boolean>>({});
  const activeTabIdRef = useRef(activeTabId);
  const tabsRef = useRef(tabs);

  const messenger = P2PMessengerManager.getInstance();

  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  // Listen for raw P2P messages to detect yjs_sync for tab activity
  useEffect(() => {
    const handleRawMessage = ({ peerCid: _rawPeerCid, message }: { peerCid: string; message: Uint8Array }) => {
      try {
        const decoded = new TextDecoder().decode(message);
        const parsed = JSON.parse(decoded);
        if (parsed.type === 'yjs_sync' && parsed.document_id) {
          const tab = tabsRef.current.find(t => t.documentId === parsed.document_id);
          if (tab && activeTabIdRef.current !== tab.id) {
            setTabActivity(prev => ({ ...prev, [tab.id]: true }));
          }
        }
      } catch (err) {
        debugLog('P2PChat', 'Error:', err);
      }
    };
    eventEmitter.on('p2p:raw-message', handleRawMessage);
    return () => { eventEmitter.off('p2p:raw-message', handleRawMessage); };
  }, []);

  const handleTabSelect = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    if (tabId === 'messages') setMessagesHasUnread(false);
    setTabActivity(prev => ({ ...prev, [tabId]: false }));
  }, []);

  const handleCloseTab = useCallback((tabId: string) => {
    setTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) setActiveTabId('messages');
  }, [activeTabId]);

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

  const handleCreateDocument = useCallback(async (title: string, _initialContent: string) => {
    if (!currentUserCid) return;
    try {
      const metadata = await liveDocumentStore.createDocument(title, peerCid.toString(), currentUserCid.toString());
      await messenger.sendMessage(peerCid, `Created live document: ${title}`, {
        messageType: 'live_document',
        documentId: metadata.id,
        documentTitle: title,
      });
      handleOpenDocument(metadata.id, title);
    } catch (error) {
      debugLog('P2PChat', 'Failed to create live document:', error);
    }
  }, [peerCid, currentUserCid, handleOpenDocument, messenger]);

  const tabsWithUnread = tabs.map(tab => ({
    ...tab,
    hasUnread: tab.id === 'messages' ? messagesHasUnread : tabActivity[tab.id] || false,
  }));

  const activeTab = tabs.find(t => t.id === activeTabId);

  return {
    tabs,
    activeTabId,
    activeTabIdRef,
    tabsWithUnread,
    activeTab,
    setMessagesHasUnread,
    handleTabSelect,
    handleCloseTab,
    handleOpenDocument,
    handleCreateDocument,
  };
}
