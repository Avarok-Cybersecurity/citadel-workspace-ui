/**
 * A tree load must not overwrite an op that landed while it was in flight.
 *
 * `getTree` awaits the IO load, and a remote op can be applied to the same key
 * during that await — `handleRevfsOperation` writes through `setTree` with no
 * coordination against a load. Without a post-await re-check, the loaded tree
 * (or the default, when nothing loads) is written straight over that op:
 * clobbered in memory, persisted over on disk, and because `setTree` fires
 * notifyTreeChanged the UI is actively repainted with the stale content.
 *
 * The default branch is the destructive one, because its callers can be
 * terminal: the SyncRequest handler calls getTree, replies, and returns without
 * writing anything back, so nothing restores what it overwrote.
 */
import { describe, it, expect } from 'vitest';
import { createTestService, defaultIntentHandler, getState, ALICE, BOB } from './revfs-service-test-helpers';
import { peerPairKey, serverTreeKey } from '../tree-queries';
import type { RevfsNode } from '@/types/revfs-types';

const withFolder = (): RevfsNode =>
  ({ name: '', type: 'directory', children: [{ name: 'test-folder', type: 'directory', children: [] }] }) as unknown as RevfsNode;

const names = (tree: RevfsNode | null | undefined) =>
  ((tree as unknown as { children?: Array<{ name: string }> })?.children ?? []).map((c) => c.name);

describe('getTree racing an applied op', () => {
  it('keeps a folder applied during the load instead of writing the default over it', async () => {
    const key = peerPairKey(ALICE, BOB);
    let service!: ReturnType<typeof createTestService>;

    service = createTestService(
      defaultIntentHandler({
        // Nothing persisted yet — the destructive default branch. The remote op
        // lands while this load is in flight, exactly as it does in the browser.
        'load-tree': () => {
          getState(service).setTree(key, withFolder());
          return { type: 'load-tree', tree: null } as never;
        },
      }),
    );

    const tree = await service.getTree(ALICE, BOB);

    expect(names(tree)).toContain('test-folder');
    expect(names(getState(service).getTree(key))).toContain('test-folder');
  });

  it('applies the same protection to server-scoped trees', async () => {
    const key = serverTreeKey(ALICE);
    let service!: ReturnType<typeof createTestService>;

    service = createTestService(
      defaultIntentHandler({
        'load-tree': () => {
          getState(service).setTree(key, withFolder());
          return { type: 'load-tree', tree: null } as never;
        },
      }),
    );

    const tree = await service.getServerTree(ALICE);

    expect(names(tree)).toContain('test-folder');
  });

  it('still returns the persisted tree when nothing raced the load', async () => {
    // The counterweight: the fix must not turn getTree into "always ignore what
    // was loaded", which would pass the tests above while breaking every cold
    // start.
    const service = createTestService(
      defaultIntentHandler({
        'load-tree': () => ({ type: 'load-tree', tree: withFolder() }) as never,
      }),
    );

    const tree = await service.getTree(ALICE, BOB);

    expect(names(tree)).toContain('test-folder');
  });
});
