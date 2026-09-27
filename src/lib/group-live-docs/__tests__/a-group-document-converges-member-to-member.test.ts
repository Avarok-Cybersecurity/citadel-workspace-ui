/**
 * A peer group's live document, kept by every member: edits reach the others whether or not they
 * have it open, a member who was away catches up by asking, a copy survives a reload, and
 * nothing echoes.
 *
 * Real: the keepers, the mesh provider, their coalescing and Yjs. Stubbed: the group transport
 * (an in-memory fan-out to the other members, as the agent's GroupMessage delivers) and storage
 * (a Map, as IndexedDB would hold it), which are I/O.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { GroupDocKeeper, KEEPER_SAVE_DELAY_MS, MAX_DOCS_PER_GROUP, type KeeperStorage } from '../group-doc-keeper';
import { GroupMeshProvider } from '../mesh-provider';
import type { GroupLiveDocBody } from '../group-doc-codec';

const GROUP: string = '12:34';
const DOC: string = '3f2b9c1e-0d4a-4c7e-9b1a-5e6f7a8b9c0d';

class Group {
  readonly members: Map<string, GroupDocKeeper> = new Map();
  readonly online: Set<string> = new Set();
  sends: number = 0;
  join(name: string, storage: KeeperStorage = memoryStorage()): GroupDocKeeper {
    const keeper: GroupDocKeeper = new GroupDocKeeper(storage, async (groupId: string, body: GroupLiveDocBody): Promise<void> => {
      this.sends += 1;
      for (const [other, k] of this.members) {
        if (other !== name && this.online.has(other)) queueMicrotask(() => { void k.receive(groupId, body); });
      }
    }, (): void => {});
    this.members.set(name, keeper);
    this.online.add(name);
    return keeper;
  }
}

function memoryStorage(): KeeperStorage & { held: Map<string, Uint8Array> } {
  const held: Map<string, Uint8Array> = new Map();
  return {
    held,
    load: async (g: string, d: string): Promise<Uint8Array | undefined> => held.get(`${g}/${d}`),
    save: async (g: string, d: string, state: Uint8Array): Promise<void> => { held.set(`${g}/${d}`, state); },
  };
}

async function settle(): Promise<void> {
  for (let i: number = 0; i < 10; i += 1) {
    await vi.advanceTimersByTimeAsync(KEEPER_SAVE_DELAY_MS + 100);
  }
}

const text = async (keeper: GroupDocKeeper): Promise<string> => (await keeper.doc(GROUP, DOC)).getText('body').toString();

type Editor = { doc: Y.Doc; provider: GroupMeshProvider };
function editor(keeper: GroupDocKeeper): Editor {
  const doc: Y.Doc = new Y.Doc();
  return { doc, provider: new GroupMeshProvider(doc, keeper, GROUP, DOC, (): void => {}) };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('a peer-group live document', () => {
  it("reaches every member's copy, open or not, and nothing is sent back", async () => {
    const group: Group = new Group();
    const alice: GroupDocKeeper = group.join('alice');
    const bob: GroupDocKeeper = group.join('bob');
    const carol: GroupDocKeeper = group.join('carol');
    const a: Editor = editor(alice);
    await settle();
    const before: number = group.sends;
    a.doc.getText('body').insert(0, 'Hello group');
    await settle();
    expect(await text(bob)).toBe('Hello group');
    expect(await text(carol)).toBe('Hello group');
    expect(group.sends - before).toBe(1);
    a.provider.destroy();
  });

  it('two members typing at once end with the same text', async () => {
    const group: Group = new Group();
    const alice: GroupDocKeeper = group.join('alice');
    const bob: GroupDocKeeper = group.join('bob');
    const a: Editor = editor(alice);
    const b: Editor = editor(bob);
    await settle();
    a.doc.getText('body').insert(0, 'AAA');
    b.doc.getText('body').insert(0, 'BBB');
    await settle();
    expect(a.doc.getText('body').toString()).toBe(b.doc.getText('body').toString());
    expect(a.doc.getText('body').toString()).toMatch(/AAA/);
    expect(a.doc.getText('body').toString()).toMatch(/BBB/);
  });

  it('a member who was away catches up on opening it', async () => {
    const group: Group = new Group();
    const alice: GroupDocKeeper = group.join('alice');
    const carol: GroupDocKeeper = group.join('carol');
    group.online.delete('carol');
    const a: Editor = editor(alice);
    await settle();
    a.doc.getText('body').insert(0, 'written while carol was away');
    await settle();
    expect(await text(carol)).toBe('');
    group.online.add('carol');
    const c: Editor = editor(carol);
    await settle();
    expect(c.doc.getText('body').toString()).toBe('written while carol was away');
  });

  it("is kept in this member's storage and there after a reload", async () => {
    const group: Group = new Group();
    const storage: ReturnType<typeof memoryStorage> = memoryStorage();
    const bob: GroupDocKeeper = group.join('bob', storage);
    const alice: GroupDocKeeper = group.join('alice');
    const a: Editor = editor(alice);
    await settle();
    a.doc.getText('body').insert(0, 'kept');
    await settle();
    expect(await text(bob)).toBe('kept');
    const reloaded: GroupDocKeeper = new GroupDocKeeper(storage, async (): Promise<void> => {}, (): void => {});
    expect(await text(reloaded)).toBe('kept');
  });

  it('ignores bytes that are not an update, and holds a bounded number of documents', async () => {
    const group: Group = new Group();
    const bob: GroupDocKeeper = group.join('bob');
    await bob.receive(GROUP, { doc_id: DOC, kind: 'update', data: new Uint8Array([255, 255, 255, 255]) });
    expect(await text(bob)).toBe('');
    for (let i: number = 0; i < MAX_DOCS_PER_GROUP + 5; i += 1) {
      await bob.receive(GROUP, { doc_id: `doc-${String(i).padStart(8, '0')}`, kind: 'sync', data: Y.encodeStateVector(new Y.Doc()) });
    }
    // One over the cap from the first receive (DOC) plus MAX-1 more: the rest were refused.
    let held: number = 0;
    for (let i: number = 0; i < MAX_DOCS_PER_GROUP + 5; i += 1) {
      if ((bob as unknown as { kept: Map<string, unknown> }).kept.has(`${GROUP} doc-${String(i).padStart(8, '0')}`)) held += 1;
    }
    expect(held).toBe(MAX_DOCS_PER_GROUP - 1);
  });
});
