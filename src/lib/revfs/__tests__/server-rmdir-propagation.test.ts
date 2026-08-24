/**
 * serverRmdir has to tell the backend to delete the files that were inside the
 * directory. Without that the tree forgets them locally while the bytes — and
 * the user's quota — stay on the server forever.
 *
 * The IO router is the only I/O here and it is injected, so these drive the real
 * operation and assert on the intents it emits.
 */
import { describe, it, expect, vi } from 'vitest';
import { serverRmdir } from '../revfs-dir-ops';
import type { DirOpsContext } from '../revfs-dir-ops';
import { collectFiles } from '../tree-queries';
import { createDefaultTree, mkdir, placeFile, serverTreeKey } from '../tree-operations';
import type { RevfsNode, RevfsFileMetadata } from '@/types/revfs-types';

const MY_CID = 7n;

function meta(name: string, dir: string): RevfsFileMetadata {
  return {
    fileId: `id-${name}`,
    fileName: name,
    fileSize: 10,
    fileType: 'text/plain',
    virtualDirectory: dir,
    uploadedByCid: MY_CID,
  };
}

/** A server tree with /docs/a.txt, /docs/deep/b.txt and /keep/c.txt. */
function buildTree(): RevfsNode {
  let tree = createDefaultTree();
  [tree] = mkdir(tree, '/docs');
  [tree] = mkdir(tree, '/docs/deep');
  [tree] = mkdir(tree, '/keep');
  [tree] = placeFile(tree, '/docs/a.txt', meta('a.txt', '/docs/a.txt'), MY_CID);
  [tree] = placeFile(tree, '/docs/deep/b.txt', meta('b.txt', '/docs/deep/b.txt'), MY_CID);
  [tree] = placeFile(tree, '/keep/c.txt', meta('c.txt', '/keep/c.txt'), MY_CID);
  return tree;
}

function setup(tree: RevfsNode) {
  const executed: Array<Record<string, unknown>> = [];
  const io = { execute: vi.fn((intent: Record<string, unknown>) => { executed.push(intent); return Promise.resolve({}); }) };
  const ctx = {
    state: { setTree: vi.fn(), getTree: vi.fn() },
    ensureIO: () => io,
    getTree: vi.fn(),
    getServerTree: vi.fn(() => Promise.resolve(tree)),
    sendAndAwaitAck: vi.fn(),
  } as unknown as DirOpsContext;
  return { ctx, executed };
}

describe('collectFiles', () => {
  it('returns every file beneath a directory, including nested ones', () => {
    const docs = buildTree().children?.find((c) => c.name === 'docs');
    expect(collectFiles(docs!).map((f) => f.name).sort()).toEqual(['a.txt', 'b.txt']);
  });

  it('returns nothing for an empty directory', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/empty');
    const empty = tree.children?.find((c) => c.name === 'empty');
    expect(collectFiles(empty!)).toEqual([]);
  });
});

describe('serverRmdir', () => {
  it('deletes every file that was under the directory, nested included', async () => {
    const { ctx, executed } = setup(buildTree());

    await serverRmdir(ctx, MY_CID, '/docs');

    const deletes = executed.filter((i) => i.type === 'backend-delete-file');
    expect(deletes.map((d) => d.virtualDir).sort()).toEqual(['/docs/a.txt', '/docs/deep/b.txt']);
  });

  it('does not touch files outside the removed directory', async () => {
    const { ctx, executed } = setup(buildTree());

    await serverRmdir(ctx, MY_CID, '/docs');

    const deleted = executed.filter((i) => i.type === 'backend-delete-file').map((d) => d.virtualDir);
    expect(deleted).not.toContain('/keep/c.txt');
  });

  it('persists the new tree before issuing deletes', async () => {
    const { ctx, executed } = setup(buildTree());

    await serverRmdir(ctx, MY_CID, '/docs');

    const persistAt = executed.findIndex((i) => i.type === 'persist-tree');
    const firstDeleteAt = executed.findIndex((i) => i.type === 'backend-delete-file');
    expect(persistAt).toBeGreaterThanOrEqual(0);
    expect(persistAt).toBeLessThan(firstDeleteAt);
    expect(executed[persistAt].treeKey).toBe(serverTreeKey(MY_CID));
  });

  it('issues no deletes for an empty directory', async () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/empty');
    const { ctx, executed } = setup(tree);

    await serverRmdir(ctx, MY_CID, '/empty');

    expect(executed.filter((i) => i.type === 'backend-delete-file')).toHaveLength(0);
    expect(executed.some((i) => i.type === 'persist-tree')).toBe(true);
  });

  it('removes the directory from the tree it persists', async () => {
    const { ctx, executed } = setup(buildTree());

    await serverRmdir(ctx, MY_CID, '/docs');

    const persisted = executed.find((i) => i.type === 'persist-tree')?.tree as RevfsNode;
    expect(persisted.children?.some((c) => c.name === 'docs')).toBe(false);
    expect(persisted.children?.some((c) => c.name === 'keep')).toBe(true);
  });
});
