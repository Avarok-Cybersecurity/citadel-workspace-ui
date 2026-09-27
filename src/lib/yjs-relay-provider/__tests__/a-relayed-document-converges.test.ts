/**
 * Two members editing one office-chat document through the server end up with the same text.
 *
 * Stubbed: the server, a network service, as a small stand-in that does what live_docs does
 * (merge with a real Yjs, number, relay to the others); the kernel's own behaviour is covered
 * by a_live_document_is_kept_by_the_server.rs. The provider, its coalescing and Yjs are real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { YjsRelayProvider, type RelayTransport } from '../relay-provider';

class FakeRelay {
  state: Uint8Array = new Uint8Array();
  seq: number = 0;
  sends: number = 0;
  private listeners: Map<number, (seq: number, update: Uint8Array) => void> = new Map();
  /** When set, the broadcast of this number to member `drop.member` is lost. */
  drop: { seq: number; member: number } | null = null;
  refuse: string | null = null;

  transport(member: number): RelayTransport {
    return {
      open: async (): Promise<{ seq: number; state: Uint8Array }> => ({ seq: this.seq, state: this.state }),
      send: async (update: Uint8Array): Promise<number> => {
        if (this.refuse) throw new Error(this.refuse);
        this.sends += 1;
        this.state = this.state.length ? Y.mergeUpdates([this.state, update]) : update;
        this.seq += 1;
        for (const [other, listener] of this.listeners) {
          if (other === member) continue;
          if (this.drop && this.drop.seq === this.seq && this.drop.member === other) continue;
          listener(this.seq, update);
        }
        return this.seq;
      },
      onRemote: (listener: (seq: number, update: Uint8Array) => void): (() => void) => {
        this.listeners.set(member, listener);
        return (): void => { this.listeners.delete(member); };
      },
    };
  }
}

const text = (doc: Y.Doc): string => doc.getText('body').toString();
const settle = async (): Promise<void> => { await vi.advanceTimersByTimeAsync(500); };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('a relayed live document', () => {
  it('converges for two members, and never sends back what it received', async () => {
    const relay: FakeRelay = new FakeRelay();
    const a: Y.Doc = new Y.Doc();
    const b: Y.Doc = new Y.Doc();
    const pa: YjsRelayProvider = new YjsRelayProvider(a, 'd1', relay.transport(1), vi.fn());
    const pb: YjsRelayProvider = new YjsRelayProvider(b, 'd1', relay.transport(2), vi.fn());
    await settle();
    a.getText('body').insert(0, 'Hello');
    await settle();
    b.getText('body').insert(5, ' world');
    await settle();
    expect(text(a)).toBe('Hello world');
    expect(text(b)).toBe('Hello world');
    expect(relay.sends).toBe(2);
    pa.destroy(); pb.destroy();
  });

  it('re-opens on a gap, and so recovers an update it never received', async () => {
    const relay: FakeRelay = new FakeRelay();
    const a: Y.Doc = new Y.Doc();
    const b: Y.Doc = new Y.Doc();
    const pa: YjsRelayProvider = new YjsRelayProvider(a, 'd1', relay.transport(1), vi.fn());
    const pb: YjsRelayProvider = new YjsRelayProvider(b, 'd1', relay.transport(2), vi.fn());
    await settle();
    relay.drop = { seq: 1, member: 2 };
    a.getText('body').insert(0, 'lost ');
    await settle();
    a.getText('body').insert(5, 'found');
    await settle();
    expect(text(b)).toBe('lost found');
    pa.destroy(); pb.destroy();
  });

  it("says why when the server refuses an edit", async () => {
    const relay: FakeRelay = new FakeRelay();
    const report: ReturnType<typeof vi.fn> = vi.fn();
    const doc: Y.Doc = new Y.Doc();
    const p: YjsRelayProvider = new YjsRelayProvider(doc, 'd1', relay.transport(1), report);
    await settle();
    relay.refuse = 'this live document has reached its size limit';
    doc.getText('body').insert(0, 'too much');
    await settle();
    expect(report).toHaveBeenCalledWith('this live document has reached its size limit');
    p.destroy();
  });
});
