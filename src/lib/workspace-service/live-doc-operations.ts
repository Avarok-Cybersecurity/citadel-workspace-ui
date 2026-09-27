/**
 * Opening and editing a live document in an office or room chat (LiveDocOpen, LiveDocUpdate).
 *
 * Each call resolves with the server's own answer to it, matched by document and content, not
 * by whichever LiveDoc response arrives next: another member's update to the same document is
 * broadcast in the same variant. A refusal rejects with the server's reason.
 */
import { GroupMessageTypeTS, type WorkspaceProtocolRequestTS } from '@/types/workspace-protocol';
import type { ProtocolSender } from './workspace-operations';
import { awaitWriteAnswer } from './await-write-response';

/** A document as the server holds it: the number of its last update and its merged state. */
export interface LiveDocSnapshot { seq: number; state: string }

const field = (payload: unknown, key: string): unknown =>
  typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>)[key] : undefined;

function numbered(payload: unknown, what: string): number {
  const seq: unknown = field(payload, 'seq');
  if (typeof seq !== 'number') throw new Error(`The server's ${what} carried no update number.`);
  return seq;
}

export async function openLiveDoc(sender: ProtocolSender, groupId: string, docId: string): Promise<LiveDocSnapshot> {
  const request: WorkspaceProtocolRequestTS = { LiveDocOpen: { group_id: groupId, doc_id: docId } };
  const answer: unknown = await awaitWriteAnswer('LiveDocOpen', () => sender.sendProtocolRequest(request),
    (p: unknown): boolean => field(p, 'group_id') === groupId && field(p, 'doc_id') === docId);
  const state: unknown = field(answer, 'state');
  if (typeof state !== 'string') throw new Error("The server's live document carried no state.");
  return { seq: numbered(answer, 'live document'), state };
}

/** Resolves with the number the server gave this update. */
export async function sendLiveDocUpdate(sender: ProtocolSender, groupId: string, docId: string, update: string): Promise<number> {
  const request: WorkspaceProtocolRequestTS = { LiveDocUpdate: { group_id: groupId, doc_id: docId, update } };
  const answer: unknown = await awaitWriteAnswer('LiveDocUpdate', () => sender.sendProtocolRequest(request),
    (p: unknown): boolean => field(p, 'doc_id') === docId && field(p, 'update') === update);
  return numbered(answer, 'answer to an edit');
}

/**
 * Share a new live document in the chat: a LiveDocument message naming it, whose text is what
 * a build that cannot open live documents shows instead.
 */
export async function shareLiveDoc(sender: ProtocolSender, groupId: string, docId: string, title: string): Promise<void> {
  const request: WorkspaceProtocolRequestTS = {
    SendGroupMessage: {
      group_id: groupId,
      message_type: GroupMessageTypeTS.LiveDocument,
      content: `Shared a live document: ${title}`,
      document_id: docId,
      document_title: title,
    },
  };
  await awaitWriteAnswer('SendGroupMessage', () => sender.sendProtocolRequest(request),
    (p: unknown): boolean => field(p, 'group_id') === groupId && field(field(p, 'message'), 'document_id') === docId);
}
