/**
 * Live documents in an office or room chat: which one is open, and sharing a new one.
 *
 * Sharing names the document in a LiveDocument message. An office or room's is kept by the
 * server from its first edit, a peer group's by every member (group-doc-keeper). The sharer's
 * copy opens straight away, as a P2P live document does.
 */
import { useState, type Dispatch, type SetStateAction } from 'react';
import { sendGroupMessageAnywhere } from '@/lib/group-conversations/send-group-message';
import { sharedLiveDocText } from '@/lib/collab/shared-live-doc';
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
    await sendGroupMessageAnywhere(groupId, sharedLiveDocText(doc.title), 'Text', undefined, doc);
    setOpen(doc);
  };
  return { open, setOpen, share };
}
