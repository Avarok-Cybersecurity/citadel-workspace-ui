/**
 * A live document shared in a peer group travels in the chat envelope, arrives as a
 * LiveDocument message naming it, and its editing traffic is routed to the keeper, never chat.
 *
 * No mocks: the real codecs and the real inbound router (toGroupEvents), on notifications of the
 * agent's shape.
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { encodeGroupMessage, decodeGroupMessage, sharedDocOf } from '@/lib/group-conversations/group-message-codec';
import { toGroupEvents } from '@/lib/group-conversations/group-events';
import { encodeGroupLiveDoc } from '../group-doc-codec';

const GROUP: string = '7:42';
const DOC: string = '3f2b9c1e-0d4a-4c7e-9b1a-5e6f7a8b9c0d';
const peerName = (cid: bigint): string => (cid === 7n ? 'ada' : cid.toString());
const notification = (body: Uint8Array): Record<string, unknown> =>
  ({ GroupMessageNotification: { cid: 111n, peer_cid: 7n, message: Array.from(body), group_key: { cid: 7n, mgid: 42n }, request_id: 'r1' } });

describe('a live document in a peer group', () => {
  it('arrives as a LiveDocument message naming the document', () => {
    const body: Uint8Array = encodeGroupMessage({
      group_id: GROUP, message_id: 'm-1', sender_cid: 7n, content: 'Shared a live document: Plan', timestamp: 1,
      message_type: 'LiveDocument', document_id: DOC, document_title: 'Plan',
    });
    const [event]: ReturnType<typeof toGroupEvents> = toGroupEvents(notification(body), 111n, 'me', peerName);
    expect(event.name).toBe('group:message-received');
    expect((event.payload as { document?: unknown }).document).toEqual({ id: DOC, title: 'Plan' });
  });

  it('is plain text when its document fields are not a real document', () => {
    for (const [id, title] of [['../x', 'Plan'], [DOC, ''], [DOC, 'x'.repeat(121)]]) {
      const decoded: ReturnType<typeof decodeGroupMessage> = decodeGroupMessage(encodeGroupMessage({
        group_id: GROUP, message_id: 'm', sender_cid: 7n, content: 'c', timestamp: 1,
        message_type: 'LiveDocument', document_id: id, document_title: title,
      }));
      expect(decoded && sharedDocOf(decoded)).toBeUndefined();
    }
  });

  it("routes a member's edit to the keeper and never to chat", () => {
    const doc: Y.Doc = new Y.Doc();
    doc.getText('body').insert(0, 'x');
    const body: Uint8Array = encodeGroupLiveDoc({
      group_id: GROUP, message_id: 'e-1', sender_cid: 7n, timestamp: 1,
      live_doc: { doc_id: DOC, kind: 'update', data: Y.encodeStateAsUpdate(doc) },
    });
    const events: ReturnType<typeof toGroupEvents> = toGroupEvents(notification(body), 111n, 'me', peerName);
    expect(events.map((e) => e.name)).toEqual(['group:live-doc-received']);
    expect(decodeGroupMessage(body)).toBeNull();
  });
});
