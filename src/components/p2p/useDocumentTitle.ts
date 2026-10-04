import { useEffect } from 'react';
import type * as Y from 'yjs';
import { observeDocTitle } from '@/lib/live-document-store/doc-title';
import { registerMountedDoc, mirrorTitleSafely } from '@/lib/live-document-store/rename';

/**
 * Keeps the document's title in step with its Yjs doc while the editor is open.
 *
 * Every change to the title, whoever made it, passes through the observer and is
 * mirrored into the stored metadata and the tab. Registering the doc is what lets
 * a rename started elsewhere (a tab's context menu) write into THIS doc, so the
 * P2P provider carries it to the peer.
 */
export function useDocumentTitle(documentId: string, doc: Y.Doc): void {
  useEffect(() => {
    const unregister: () => void = registerMountedDoc(documentId, doc);
    const unobserve: () => void = observeDocTitle(doc, (title) => mirrorTitleSafely(documentId, title));
    return (): void => { unobserve(); unregister(); };
  }, [documentId, doc]);
}
