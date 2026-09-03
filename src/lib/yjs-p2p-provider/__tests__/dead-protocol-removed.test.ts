/**
 * Defect D: 'hash_check' / 'yjs_divergence' were a one-ended protocol —
 * handlers with no initiator anywhere in the tree. Worse, handleHashCheck
 * answered a MATCHING hash with another hash_check, so wiring the missing
 * initiator would have shipped an infinite ping-pong. The dead half was
 * REMOVED (hash verification rides doc_hash on updates and local_hash on
 * ACKs instead — the opposite-direction case in hash-verification.test.ts
 * proves that live path still recovers real divergence).
 *
 * These tests pin the removal: a legacy peer emitting either message gets
 * silence, not a reply — the ping-pong seed and the spurious full-state
 * broadcast are both gone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { eventEmitter } from '@/lib/event-emitter';
import type { OutboxEntry } from './wire-harness';

const outbox: OutboxEntry[] = [];

vi.mock('@/lib/websocket-service', () => ({
  websocketService: {
    sendP2PMessageBytes: (own: bigint, peer: bigint, bytes: Uint8Array): Promise<void> => {
      outbox.push({ from: own.toString(), to: peer.toString(), bytes });
      return Promise.resolve();
    },
  },
}));

import { YjsP2PProvider } from '../provider';

beforeEach(() => {
  outbox.length = 0;
});

describe('dead hash_check / yjs_divergence protocol (defect D)', () => {
  it('a legacy hash_check gets no reply, matching or not', () => {
    const doc: Y.Doc = new Y.Doc();
    const provider: YjsP2PProvider = new YjsP2PProvider('doc-d', '2', doc, '1', '1');
    outbox.length = 0;

    // Matching hash: the old responder replied with ANOTHER hash_check —
    // the seed of the ping-pong.
    eventEmitter.emit('yjs:p2p-command', {
      peerCid: 2n,
      payload: {
        type: 'yjs_sync',
        sub_type: 'hash_check',
        document_id: 'doc-d',
        data: [],
        doc_hash: provider.getDocumentHash(),
        message_id: 'legacy-match',
      },
    });
    expect(outbox).toHaveLength(0);

    // Mismatching hash: the old responder invoked divergence recovery and,
    // as creator, broadcast a full_state.
    eventEmitter.emit('yjs:p2p-command', {
      peerCid: 2n,
      payload: {
        type: 'yjs_sync',
        sub_type: 'hash_check',
        document_id: 'doc-d',
        data: [],
        doc_hash: 'not-the-local-hash',
        message_id: 'legacy-mismatch',
      },
    });
    expect(outbox).toHaveLength(0);

    provider.destroy();
  });

  it('a legacy yjs_divergence gets no full_state broadcast', () => {
    const doc: Y.Doc = new Y.Doc();
    const provider: YjsP2PProvider = new YjsP2PProvider('doc-d2', '2', doc, '1', '1');
    outbox.length = 0;

    eventEmitter.emit('yjs:p2p-command', {
      peerCid: 2n,
      payload: {
        type: 'yjs_divergence',
        document_id: 'doc-d2',
        local_hash: 'x',
        remote_hash: 'y',
        action: 'full_resync',
      },
    });
    expect(outbox).toHaveLength(0);

    provider.destroy();
  });
});
