/**
 * useP2PTabs Hook
 *
 * Manages the tab system for P2PChat: messages tab, live document tabs,
 * tab activity indicators, and tab open/close/select actions.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import { seedDocument } from '@/lib/live-document-store/seed-document';
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

  const messenger: P2PMessengerManager = P2PMessengerManager.getInstance();

  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  // Listen for Yjs sync messages dispatched via the new typed
  // `yjs:p2p-command` event so the tab-activity indicator flips on
  // when a yjs_sync arrives for an open document. The pre-CBOR
  // implementation listened on `p2p:raw-message` and JSON.parsed
  // the bytes — once Yjs sending was switched to CBOR
  // (see `lib/yjs-p2p-provider/sending.ts`), every message logged
  // "Unexpected token … is not valid JSON" and the activity flag
  // never fired again. The CBOR-decoded payload preserves
  // `type` + `document_id`, so the filter logic is unchanged.
  useEffect(() => {
    const handleYjsCommand = ({ payload }: { peerCid: bigint; payload: Record<string, unknown> }): void => {
      if (payload.type !== 'yjs_sync') return;
      const docId: string | undefined = typeof payload.document_id === 'string' ? payload.document_id : undefined;
      if (!docId) return;
      const tab: ChatTab | undefined = tabsRef.current.find(t => t.documentId === docId);
      if (tab && activeTabIdRef.current !== tab.id) {
        setTabActivity(prev => ({ ...prev, [tab.id]: true }));
      }
    };
    eventEmitter.on('yjs:p2p-command', handleYjsCommand);
    return (): void => { eventEmitter.off('yjs:p2p-command', handleYjsCommand); };
  }, []);

  const handleTabSelect = useCallback((tabId: string): void => {
    setActiveTabId(tabId);
    if (tabId === 'messages') setMessagesHasUnread(false);
    setTabActivity(prev => ({ ...prev, [tabId]: false }));
  }, []);

  const handleCloseTab = useCallback((tabId: string): void => {
    setTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) setActiveTabId('messages');
  }, [activeTabId]);

  const handleOpenDocument = useCallback((docId: string, title: string): void => {
    // Adopt before opening. Only the CREATOR had a store record, so on the
    // recipient's side updateDocumentState found nothing and silently wrote
    // nothing — every edit they made was lost when the tab closed. Adoption is
    // idempotent and keeps the id it was given, which is what makes this the
    // same document on both sides rather than two.
    if (currentUserCid) {
      void liveDocumentStore
        .adoptDocument(docId, title, peerCid.toString(), currentUserCid.toString())
        .catch((error: unknown) =>
          debugLog('P2PChat', 'Could not adopt live document', docId, error)
        );
    }

    const existingTab: ChatTab | undefined = tabs.find(t => t.documentId === docId);
    if (existingTab) {
      setActiveTabId(existingTab.id);
    } else {
      const newTab: ChatTab = createLiveDocumentTab(docId, title);
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
  }, [tabs, currentUserCid, peerCid]);

  const handleCreateDocument = useCallback(async (title: string, initialContent: string): Promise<void> => {
    // Was `if (!currentUserCid) return;` — a success-shaped no-op that closed
    // the modal and cleared the compose box having created nothing.
    if (!currentUserCid) throw new Error('Cannot create a document before the session has a CID');

    // The typed message, which this parameter used to ignore entirely.
    const metadata = await liveDocumentStore.createDocument(
      title,
      peerCid.toString(),
      currentUserCid.toString(),
      initialContent ? seedDocument(initialContent) : undefined,
    );
    await messenger.sendMessage(peerCid, `Created live document: ${title}`, {
      messageType: 'live_document',
      documentId: metadata.id,
      documentTitle: title,
    });
    handleOpenDocument(metadata.id, title);
    // No catch: LiveDocumentModal was written to render this failure
    // ("Could not create the document…"), and swallowing it here made that
    // branch unreachable — the modal closed normally, the title and the typed
    // content were discarded, and no tab opened.
  }, [peerCid, currentUserCid, handleOpenDocument, messenger]);

  const tabsWithUnread = tabs.map(tab => ({
    ...tab,
    hasUnread: tab.id === 'messages' ? messagesHasUnread : tabActivity[tab.id] || false,
  }));

  const activeTab: ChatTab | undefined = tabs.find(t => t.id === activeTabId);

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
