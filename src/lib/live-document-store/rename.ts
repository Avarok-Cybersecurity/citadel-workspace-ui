/**
 * Renaming a live document.
 *
 * The Yjs map is the authority (see doc-title.ts). A rename is therefore one
 * write into the document, and everything else follows from observing it:
 * `mirrorTitle` copies it into DocumentMetadata and tells the tabs.
 *
 * When the document's editor is mounted, its Y.Doc is registered here and the
 * rename is written to THAT doc, so the P2P provider carries it to the peer
 * live. When it is not (a background tab), the stored state is loaded, renamed
 * and saved; the peer receives the change in the normal sync the next time the
 * document is opened, because a Y.Map write merges.
 */

import * as Y from 'yjs';
import { eventEmitter } from '@/lib/event-emitter';
import { debugLog } from '@/lib/debug-config';
import { liveDocumentStore } from './index';
import { validateDocTitle, writeDocTitle, type TitleCheck } from './doc-title';
import type { StoredDocument } from './types';

export const DOC_TITLE_CHANGED_EVENT: 'live-document:title-changed' = 'live-document:title-changed';
export interface DocTitleChanged { documentId: string; title: string }

const mountedDocs: Map<string, Y.Doc> = new Map<string, Y.Doc>();

/** Called by the editor while it is mounted. Returns the unregister. */
export function registerMountedDoc(documentId: string, doc: Y.Doc): () => void {
  mountedDocs.set(documentId, doc);
  return (): void => {
    if (mountedDocs.get(documentId) === doc) mountedDocs.delete(documentId);
  };
}

/** Copies a title into the stored metadata and announces it to the tabs. */
export async function mirrorTitle(documentId: string, title: string): Promise<void> {
  // Subscriber: hooks/useP2PTabs.ts (the tab title follows the document).
  eventEmitter.emit<DocTitleChanged>(DOC_TITLE_CHANGED_EVENT, { documentId, title });
  const stored: StoredDocument | null = await liveDocumentStore.loadDocument(documentId);
  if (!stored || stored.metadata.title === title) return;
  await liveDocumentStore.saveDocument(documentId, { ...stored, metadata: { ...stored.metadata, title } });
}

/** Mirror failures are reported, not thrown: the CRDT already holds the title. */
export function mirrorTitleSafely(documentId: string, title: string): void {
  mirrorTitle(documentId, title).catch((error: unknown) =>
    debugLog('LiveDocument', 'Could not record the new title for', documentId, error),
  );
}

/** Validates, then renames. Throws the validation reason, so no caller can skip the check. */
export async function renameLiveDocument(documentId: string, raw: string): Promise<string> {
  const check: TitleCheck = validateDocTitle(raw);
  if (!check.ok) throw new Error(check.reason);

  const mounted: Y.Doc | undefined = mountedDocs.get(documentId);
  if (mounted) {
    // The editor's own observer mirrors it; writing here is the whole job.
    return writeDocTitle(mounted, check.title);
  }

  const stored: Y.Doc | null = await liveDocumentStore.loadIntoYDoc(documentId);
  if (!stored) throw new Error('This document is not saved on this device, so it cannot be renamed.');
  const title: string = writeDocTitle(stored, check.title);
  await liveDocumentStore.updateDocumentState(documentId, stored);
  await mirrorTitle(documentId, title);
  return title;
}
