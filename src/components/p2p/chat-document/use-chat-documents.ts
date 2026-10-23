/**
 * The documents a chat has opened in its tabs: each opened once (moved first when it was made
 * in the earlier editor), kept while the chat is mounted so switching tabs does not reopen it,
 * and renamed through its live sync. The canvas's opener and the migration load on first use.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { describeFailure } from '@/lib/failure-message';
import { openChatDocumentTab, type ChatDocumentOpener, type ChatDocumentOpening, type ChatDocumentTarget, type OpeningPorts } from './chat-document-opening';
import type { ChatDocumentMigration } from '@/lib/live-doc-migration/boot';

export const APP_OPENING_PORTS: OpeningPorts = {
  opener: (): Promise<ChatDocumentOpener> => import('@/components/documents/chat-replica').then((m): ChatDocumentOpener => m.openChatDocument),
  migration: (): Promise<ChatDocumentMigration> => import('@/lib/live-doc-migration/boot').then((m): ChatDocumentMigration => m.chatDocumentMigration),
  report: (title: string, error: unknown): void => { toast.error(title, { description: describeFailure(error, 'Try opening the document again.') }); },
};

export interface ChatDocuments {
  /** Every document opened in this chat: null while it opens. */
  readonly openings: ReadonlyMap<string, ChatDocumentOpening | null>;
  /** Opens `target` unless it is open or opening already. */
  open(target: ChatDocumentTarget): void;
  /** Opens a document again after it did not load. */
  retry(docId: string): void;
  /** Renames it for both people; rejects with the reason when it cannot be. */
  rename(docId: string, title: string): Promise<void>;
}

export function useChatDocuments(ports: OpeningPorts): ChatDocuments {
  const [openings, setOpenings] = useState<ReadonlyMap<string, ChatDocumentOpening | null>>(new Map());
  const targets: MutableRefObject<Map<string, ChatDocumentTarget>> = useRef<Map<string, ChatDocumentTarget>>(new Map());
  const openingsRef: MutableRefObject<ReadonlyMap<string, ChatDocumentOpening | null>> = useRef(openings);
  const mounted: MutableRefObject<boolean> = useRef<boolean>(true);
  useEffect((): (() => void) => {
    mounted.current = true;
    return (): void => { mounted.current = false; };
  }, []);
  useEffect((): void => { openingsRef.current = openings; }, [openings]);

  const set: (docId: string, opening: ChatDocumentOpening | null) => void = useCallback((docId: string, opening: ChatDocumentOpening | null): void => {
    setOpenings((prev: ReadonlyMap<string, ChatDocumentOpening | null>): ReadonlyMap<string, ChatDocumentOpening | null> => new Map(prev).set(docId, opening));
  }, []);

  const open: (target: ChatDocumentTarget) => void = useCallback((target: ChatDocumentTarget): void => {
    if (targets.current.has(target.docId)) return;
    targets.current.set(target.docId, target);
    set(target.docId, null);
    void openChatDocumentTab(target, ports).then((opening: ChatDocumentOpening): void => {
      if (mounted.current && targets.current.get(target.docId) === target) set(target.docId, opening);
    });
  }, [ports, set]);

  const retry: (docId: string) => void = useCallback((docId: string): void => {
    const target: ChatDocumentTarget | undefined = targets.current.get(docId);
    if (target === undefined) return;
    targets.current.delete(docId);
    open(target);
  }, [open]);

  const rename: (docId: string, title: string) => Promise<void> = useCallback(async (docId: string, title: string): Promise<void> => {
    const opening: ChatDocumentOpening | null | undefined = openingsRef.current.get(docId);
    if (opening?.kind !== 'canvas') throw new Error('This document did not open in the editor, so it cannot be renamed.');
    await opening.document.rename(title);
  }, []);

  return { openings, open, retry, rename };
}
