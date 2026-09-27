/**
 * A peer group's live-document traffic, sent over the same `GroupMessage` transport as chat.
 *
 * Two kinds: `update`, a Yjs update to apply, and `sync`, a member's state vector, which every
 * member holding more answers with an `update` of what that member lacks. Yjs merges any order
 * and any repetition to the same document, so neither needs numbering or acknowledgement.
 *
 * Follows group-reaction-codec's rule for a non-chat body: no `content` and no `control`, so a
 * build that predates this envelope decodes it as neither and drops it.
 */
import { encode as cborEncode, decode as cborDecode } from 'cbor-x';

/** The largest update or state vector carried at once, as the office relay caps it. */
export const MAX_LIVE_DOC_BYTES: number = 64 * 1024;

export interface GroupLiveDocBody {
  doc_id: string;
  kind: 'update' | 'sync';
  data: Uint8Array;
}

export interface PeerGroupLiveDoc {
  group_id: string;
  message_id: string;
  sender_cid: bigint;
  timestamp: number;
  live_doc: GroupLiveDocBody;
}

const DOC_ID: RegExp = /^[0-9a-f-]{8,64}$/;

export function encodeGroupLiveDoc(message: PeerGroupLiveDoc): Uint8Array {
  return cborEncode(message);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toBody(raw: unknown): GroupLiveDocBody | null {
  const r: Record<string, unknown> | null = asRecord(raw);
  if (!r || typeof r.doc_id !== 'string' || !DOC_ID.test(r.doc_id)) return null;
  if (r.kind !== 'update' && r.kind !== 'sync') return null;
  // A typed array from another realm (WASM, a worker) is not `instanceof Uint8Array` here.
  if (!ArrayBuffer.isView(r.data) || r.data.byteLength > MAX_LIVE_DOC_BYTES) return null;
  const view: ArrayBufferView = r.data;
  return { doc_id: r.doc_id, kind: r.kind, data: new Uint8Array(view.buffer, view.byteOffset, view.byteLength) };
}

/** Null for anything that is not a well-formed live-document envelope, including chat. */
export function decodeGroupLiveDoc(bytes: Uint8Array): PeerGroupLiveDoc | null {
  try {
    const decoded: Record<string, unknown> | null = asRecord(cborDecode(bytes));
    if (!decoded || decoded.live_doc === undefined) return null;
    if (typeof decoded.group_id !== 'string' || typeof decoded.message_id !== 'string') return null;
    if (typeof decoded.sender_cid !== 'bigint' || typeof decoded.timestamp !== 'number') return null;
    const live_doc: GroupLiveDocBody | null = toBody(decoded.live_doc);
    if (!live_doc) return null;
    return { group_id: decoded.group_id, message_id: decoded.message_id, sender_cid: decoded.sender_cid, timestamp: decoded.timestamp, live_doc };
  } catch {
    return null;
  }
}
