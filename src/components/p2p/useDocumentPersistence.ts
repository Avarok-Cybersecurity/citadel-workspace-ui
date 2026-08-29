import { useEffect } from 'react';
import type * as Y from 'yjs';
import { liveDocumentStore } from '@/lib/live-document-store';
import { toast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debug-config';

/** Yjs fires per keystroke and each save re-encodes the whole document. */
const DOCUMENT_PERSIST_DEBOUNCE_MS = 800;

/**
 * Loads a live document from storage and keeps it saved.
 *
 * The store had loadIntoYDoc, updateDocumentState and loadDocument fully
 * implemented and ZERO callers outside its own directory. useCollaborativeEditor
 * started a fresh empty Y.Doc on every mount and loaded nothing, and P2PChat
 * renders LiveDocumentView with no `onSave` — so everything typed lived only in
 * RAM and in the P2P stream, and closing the tab lost it. The header stamped
 * "Last saved <time>" throughout, because setLastSaved sat outside the
 * `if (onSave)` guard. There was no write to fail; there was no write.
 *
 * The load is not just a feature: it populates the store's document cache, and
 * updateDocumentState returns early without a cache entry. Saving after a
 * reload depends on having loaded first.
 */
export function useDocumentPersistence(documentId: string, doc: Y.Doc): void {
  useEffect(() => {
    let cancelled: boolean = false;
    void liveDocumentStore
      .loadIntoYDoc(documentId, doc)
      .then((loaded) => {
        if (!cancelled && loaded) {
          debugLog('CollaborativeEditor', 'Restored persisted state for', documentId);
        }
      })
      .catch((error: unknown) => {
        // Non-fatal: an unsaved document has nothing to restore, and the P2P
        // provider still populates it from the peer.
        debugLog('CollaborativeEditor', 'Could not restore document', documentId, error);
      });
    return (): void => {
      cancelled = true;
    };
  }, [documentId, doc]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const persist = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void liveDocumentStore.updateDocumentState(documentId, doc).catch((error: unknown) => {
          debugLog('CollaborativeEditor', 'Failed to persist document', documentId, error);
        });
      }, DOCUMENT_PERSIST_DEBOUNCE_MS);
    };
    doc.on('update', persist);
    return (): void => {
      doc.off('update', persist);
      if (timer) clearTimeout(timer);
      // Flush on unmount so closing the tab does not drop the last edits.
      //
      // This is the LAST chance — the debounced write above can retry on the
      // next edit, and there are no more edits. A swallowed failure here is
      // exactly the case where the user's work is gone, so it is announced
      // rather than discarded.
      void liveDocumentStore.updateDocumentState(documentId, doc).catch((error: unknown) => {
        debugLog('CollaborativeEditor', 'Final flush failed for', documentId, error);
        // Toasted, not emitted. This announced itself on
        // 'live-document:persist-failed' — an event with ZERO listeners — so the
        // comment above described a report that reached nobody, in the one place
        // it says the user's work is gone. A direct toast removes the wire
        // rather than adding a second end to it.
        toast({
          variant: 'destructive',
          title: 'Your last edits could not be saved',
          description: 'The document was closed before the final save completed.',
        });
      });
    };
  }, [documentId, doc]);
}
