/**
 * Live documents in an office or room chat: which one is open, and sharing a new one.
 *
 * Sharing names the document in a LiveDocument message; the server keeps it from its first
 * edit. The sharer's copy opens straight away, as a P2P live document does.
 */
import { useState, type Dispatch, type SetStateAction } from 'react';
import WorkspaceService from '@/lib/workspace-service';
import type { OpenLiveDoc } from './GroupLiveDocCard';

/** The title a document gets when the composer's box is empty (item 11: an empty box works). */
export const UNTITLED_DOCUMENT: string = 'Untitled document';

export interface GroupLiveDocs {
  open: OpenLiveDoc | null;
  setOpen: Dispatch<SetStateAction<OpenLiveDoc | null>>;
  /** Rejects with the server's refusal, so the composer keeps what was typed. */
  share: (typedTitle: string) => Promise<void>;
}

export function useGroupLiveDocs(groupId: string): GroupLiveDocs {
  const [open, setOpen] = useState<OpenLiveDoc | null>(null);
  const share = async (typedTitle: string): Promise<void> => {
    const doc: OpenLiveDoc = { id: crypto.randomUUID(), title: typedTitle.trim() || UNTITLED_DOCUMENT };
    await WorkspaceService.shareLiveDoc(groupId, doc.id, doc.title);
    setOpen(doc);
  };
  return { open, setOpen, share };
}
