/**
 * useP2PTabs Hook
 *
 * Manages the tab system for P2PChat: messages tab, live document tabs,
 * tab activity indicators, and tab open/close/select actions.
 */

import { useState, useEffect, useRef, useCallback , type MutableRefObject  } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import { seedDocument } from '@/lib/live-document-store/seed-document';
import { liveDocumentStore } from '@/lib/live-document-store';
import { P2PMessengerManager } from '@/lib/p2p';
import { debugLog } from '@/lib/debug-config';
import { writeDocTitle } from '@/lib/live-document-store/doc-title';
import { renameLiveDocument, DOC_TITLE_CHANGED_EVENT, type DocTitleChanged } from '@/lib/live-document-store/rename';
import * as Y from 'yjs';
import { ChatTab, MESSAGES_TAB, createLiveDocumentTab } from '../ChatTabBar';
import type { DocumentMetadata } from '@/lib/live-document-store/types';
import type { Dispatch, SetStateAction } from 'react';
import { citadelApp, creatableIn } from '@/lib/citadel-apps/registry';
import type { NewChatDocumentInput } from '../LiveDocumentModal';

/** A chat document, made and open. `delivered` settles with its invitation's send; a failure there has a bubble. */
export interface ChatDocumentMade {
  delivered: Promise<void>;
}

interface Invitation {
  /** The invitation is in the conversation, or its send settled first. */
  recorded: Promise<void>;
  delivered: Promise<void>;
}

/** A send split where its message is recorded: after that point a failure has a bubble to show it on. */
function whenRecorded(send: (onRecorded: () => void) => Promise<unknown>): Invitation {
  let markRecorded: () => void = (): void => undefined;
  const recordedSignal: Promise<void> = new Promise<void>((resolve: () => void): void => { markRecorded = resolve; });
  const delivered: Promise<void> = send((): void => markRecorded()).then((): void => undefined);
  return { recorded: Promise.race([recordedSignal, delivered]), delivered };
}

interface UseP2PTabsOptions {
  peerCid: bigint;
  currentUserCid?: bigint;
}

export function useP2PTabs({ peerCid, currentUserCid }: UseP2PTabsOptions): { tabs: ChatTab[]; activeTabId: string; activeTabIdRef: MutableRefObject<string>; tabsWithUnread: { hasUnread: boolean; id: string; type: "messages" | "live_document"; title: string; documentId?: string; }[]; activeTab: ChatTab | undefined; setMessagesHasUnread: Dispatch<SetStateAction<boolean>>; handleTabSelect: (tabId: string) => void; handleCloseTab: (tabId: string) => void; handleOpenDocument: (docId: string, title: string) => void; handleCreateDocument: (input: NewChatDocumentInput) => Promise<ChatDocumentMade>; handleRenameDocument: (documentId: string, title: string) => Promise<void>; } {
  const [tabs, setTabs] = useState<ChatTab[]>([MESSAGES_TAB]);
  const [activeTabId, setActiveTabId] = useState('messages');
  const [messagesHasUnread, setMessagesHasUnread] = useState(false);
  const [tabActivity, setTabActivity] = useState<Record<string, boolean>>({});
  const activeTabIdRef: MutableRefObject<string> = useRef(activeTabId);
  const tabsRef: MutableRefObject<ChatTab[]> = useRef(tabs);

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

  // The tab title follows the document: a rename by this user or by a peer
  // reaches here once, through the metadata mirror (see rename.ts).
  useEffect(() => {
    const handleTitle = (change?: DocTitleChanged): void => {
      if (!change) return;
      setTabs(prev => prev.map(t => (t.documentId === change.documentId && t.title !== change.title ? { ...t, title: change.title } : t)));
    };
    eventEmitter.on(DOC_TITLE_CHANGED_EVENT, handleTitle);
    return (): void => { eventEmitter.off(DOC_TITLE_CHANGED_EVENT, handleTitle); };
  }, []);

  const handleTabSelect: (tabId: string) => void = useCallback((tabId: string): void => {
    setActiveTabId(tabId);
    if (tabId === 'messages') setMessagesHasUnread(false);
    setTabActivity(prev => ({ ...prev, [tabId]: false }));
  }, []);

  const handleCloseTab: (tabId: string) => void = useCallback((tabId: string): void => {
    setTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) setActiveTabId('messages');
  }, [activeTabId]);

  const handleOpenDocument: (docId: string, title: string) => void = useCallback((docId: string, title: string): void => {
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

  const handleCreateDocument: (input: NewChatDocumentInput) => Promise<ChatDocumentMade> = useCallback(async ({ app, title, initialContent }: NewChatDocumentInput): Promise<ChatDocumentMade> => {
    // Was `if (!currentUserCid) return;` — a success-shaped no-op that closed
    // the modal and cleared the compose box having created nothing.
    if (!currentUserCid) throw new Error('Cannot create a document before the session has a CID');
    // The picker offers only apps a chat can make; this refuses one a caller got around it with.
    if (!creatableIn(citadelApp(app), 'chat')) throw new Error(`${citadelApp(app).name} documents cannot be made in a chat yet.`);

    // The typed message, which this parameter used to ignore entirely.
    // The creator seeds the title into the document so the CRDT carries it from
    // revision zero. Only the creator does: a peer's own seed would be a
    // concurrent write that could outrank a later rename.
    const seeded: Y.Doc = initialContent ? seedDocument(initialContent) : new Y.Doc();
    const cleanTitle: string = writeDocTitle(seeded, title);
    const metadata: DocumentMetadata = await liveDocumentStore.createDocument(
      cleanTitle,
      peerCid.toString(),
      currentUserCid.toString(),
      seeded,
    );
    // Opened once the invitation is in the conversation, not once the network has carried it.
    // Awaiting the whole send (CheckState, the leader's ack, the agent's transmit) left the
    // document closed behind "Creating...", and closed for good on a delivery failure although
    // it existed. A text message stops waiting at the same point (useP2PCompose).
    const invitation: Invitation = whenRecorded((onRecorded: () => void): Promise<unknown> =>
      messenger.sendMessage(peerCid, `Created live document: ${cleanTitle}`, {
        messageType: 'live_document',
        documentId: metadata.id,
        documentTitle: cleanTitle,
        onOptimisticAppend: onRecorded,
      }));
    // No catch: a failure before the invitation exists is LiveDocumentModal's to render
    // ("Could not create the document…"); swallowing it here made that branch unreachable.
    await invitation.recorded;
    handleOpenDocument(metadata.id, cleanTitle);
    return { delivered: invitation.delivered };
  }, [peerCid, currentUserCid, handleOpenDocument, messenger]);

  const handleRenameDocument: (documentId: string, title: string) => Promise<void> = useCallback(
    async (documentId: string, title: string): Promise<void> => {
      await renameLiveDocument(documentId, title);
    },
    [],
  );

  const tabsWithUnread: { hasUnread: boolean; id: string; type: "messages" | "live_document"; title: string; documentId?: string; }[] = tabs.map(tab => ({
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
    handleRenameDocument,
  };
}
