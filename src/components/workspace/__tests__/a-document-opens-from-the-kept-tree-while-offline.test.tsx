/**
 * The last tree the server listed is kept on this device, per account, beside the document
 * replicas (cdoc-collab:<account>:#tree). After a reload with the server link down (the agent
 * says it is reconnecting) a document opens from it, under a notice that says the tree is the
 * kept one and from when; with the link up it is never shown; sign-out removes it, and a deleted
 * node's sweep never does.
 *
 * Real: the seam, the kept-tree hook, WorkspaceView, the sidebar and DocumentView. Doubled, each
 * because it is I/O this test does not have: `storage-utils` (a Map that round-trips through
 * structuredClone, as IndexedDB does; jsdom has no IndexedDB), `useTabIdentity` (the tab's
 * session read), `usePermission` (agent I/O) and BaseOffice (compiles MDX, mounts chat; only
 * whether it is chosen is under test).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import type { UsePermissionResult } from '@/hooks/use-permission-result';
import type { TabIdentity } from '@/lib/tab-identity';
import { encodeNodeApp } from '@/lib/citadel-apps/node-app-metadata';
import { reconnectingTo } from '@/lib/reconnect/server-reconnect';
import { readCachedTree, shownNode, treeToKeep, type CachedWorkspaceTree } from '@/lib/offline-tree';
import { ESTATE, domainNode, renderHierarchy } from '@/components/layout/sidebar/__tests__/render-hierarchy';
import type { DomainNode } from '@/components/layout/sidebar/tree-node-types';

const store: Map<string, unknown> = vi.hoisted((): Map<string, unknown> => new Map<string, unknown>());
vi.mock('@/lib/storage-utils', async () => (await import('@/lib/cdoc/collab/__tests__/doubles/memory-storage')).memoryStorageUtils(store));
const ME: TabIdentity = vi.hoisted((): TabIdentity => ({ username: 'alice', cid: 11n }));
vi.mock('@/hooks/use-tab-identity', () => ({ useTabIdentity: (): TabIdentity => ME }));
vi.mock('@/hooks/use-permission', () => ({
  usePermission: (): UsePermissionResult => ({
    allowed: true, loading: false, reason: null, unanswered: false, answered: true, refresh: async (): Promise<void> => {},
  }) as UsePermissionResult,
}));
vi.mock('@/components/office/BaseOffice', () => ({
  BaseOffice: ({ nodeId }: { nodeId?: string }): JSX.Element => <article data-testid="page" data-node={nodeId ?? 'home'} />,
}));

const { WorkspaceView } = await import('../WorkspaceView');
const { saveKeptTree, useKeepWorkspaceTree, useKeptTree } = await import('@/hooks/use-kept-tree');
const { forgetAccountDocuments, forgetDeletedNodes, forgetNodeDocuments, loadWorkspaceTree, saveWorkspaceTree, workspaceTreeKey } = await import('@/lib/document-replica-cache');

function Page(): JSX.Element {
  const location: ReturnType<typeof useLocation> = useLocation();
  return <WorkspaceView nodeId={new URLSearchParams(location.search).get('nodeId')} />;
}

const PLAN: DomainNode = { ...domainNode('plan', 'alex', 'Floor', [], 'Quarterly plan'), metadata: Array.from(encodeNodeApp(null, 'docs')) };
const SAVED_AT: number = Date.UTC(2026, 9, 18, 9, 30);
const keptOf = (nodes: DomainNode[]): CachedWorkspaceTree => {
  const tree: CachedWorkspaceTree | null = treeToKeep(Object.fromEntries(nodes.map((n: DomainNode) => [n.id, n])), SAVED_AT);
  if (tree === null) throw new Error('a tree with nodes is kept');
  return tree;
};

afterEach((): void => { store.clear(); reconnectingTo.set(null); });

/** A reload with no connection: the server has listed nothing in this page's life. */
async function reloadOffline(at: string, linkDown: boolean): Promise<void> {
  if (linkDown) reconnectingTo.set('acme.work.example.net');
  renderHierarchy([], at, <Page />);
  await act(async (): Promise<void> => { await Promise.resolve(); });
}

describe('the kept workspace tree', () => {
  it('is written each time the server lists the tree, and not while it is still loading', async () => {
    const live: Record<string, DomainNode> = Object.fromEntries([...ESTATE, PLAN].map((n: DomainNode) => [n.id, n]));
    const hook = renderHook(({ loading }: { loading: boolean }): void => useKeepWorkspaceTree(saveKeptTree, 11n, live, loading), { initialProps: { loading: true } });
    await act(async (): Promise<void> => { await Promise.resolve(); });
    expect(store.has(workspaceTreeKey(11n))).toBe(false);
    hook.rerender({ loading: false });
    await waitFor(async (): Promise<void> => expect((await loadWorkspaceTree(11n))?.nodes).toEqual(live));
  });

  it('opens a document after a reload with the link down, labelled as the kept tree and its time', async () => {
    await saveWorkspaceTree(11n, keptOf([...ESTATE, PLAN]));
    await reloadOffline('/workspace?nodeId=plan', true);
    expect(await screen.findByTestId('workspace-offline-notice')).toHaveTextContent(`Offline — showing the tree as of ${new Date(SAVED_AT).toLocaleString()}.`);
    expect(screen.getByTestId('document-host')).toHaveAttribute('data-app', 'docs');
    expect(screen.getByRole('heading', { name: 'Quarterly plan' })).toBeInTheDocument();
  });

  it('says a kept page that is not a document waits for the server', async () => {
    await saveWorkspaceTree(11n, keptOf(ESTATE));
    await reloadOffline('/workspace?nodeId=floor3', true);
    expect(await screen.findByTestId('workspace-offline-waits')).toHaveTextContent('This page opens once the server is back.');
    expect(screen.queryByTestId('page')).toBeNull();
  });

  it('is never shown while the link is up', async () => {
    await saveWorkspaceTree(11n, keptOf([...ESTATE, PLAN]));
    await reloadOffline('/workspace?nodeId=plan', false);
    expect(screen.getByText('This page is no longer here')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-offline-notice')).toBeNull();
    expect(screen.queryByTestId('document-host')).toBeNull();
  });

  it('is neither read nor chosen while the link is up, each on its own', async () => {
    const asked: bigint[] = [];
    const load = async (account: bigint): Promise<CachedWorkspaceTree | null> => { asked.push(account); return keptOf([PLAN]); };
    const hook = renderHook((): ReturnType<typeof useKeptTree> => useKeptTree(load, 11n, false));
    await act(async (): Promise<void> => { await Promise.resolve(); });
    expect(asked).toEqual([]);
    expect(hook.result.current).toEqual({ kind: 'unread' });
    expect(shownNode('plan', {}, false, keptOf([PLAN]))).toEqual({ kind: 'none' });
    expect(shownNode('plan', {}, true, keptOf([PLAN]))).toEqual({ kind: 'kept', node: PLAN, savedAt: SAVED_AT });
  });

  it('gives way to the live node when the server has listed it, link down or not', async () => {
    await saveWorkspaceTree(11n, keptOf([...ESTATE, { ...PLAN, name: 'Old plan' }]));
    reconnectingTo.set('acme.work.example.net');
    renderHierarchy([...ESTATE, PLAN], '/workspace?nodeId=plan', <Page />);
    await act(async (): Promise<void> => { await Promise.resolve(); });
    expect(screen.getByRole('heading', { name: 'Quarterly plan' })).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-offline-notice')).toBeNull();
  });

  it('is removed with the account on sign-out, and no other account\'s is', async () => {
    await saveWorkspaceTree(11n, keptOf(ESTATE));
    await saveWorkspaceTree(12n, keptOf(ESTATE));
    await forgetAccountDocuments(11n);
    expect(await loadWorkspaceTree(11n)).toBeNull();
    expect(await loadWorkspaceTree(12n)).toEqual(keptOf(ESTATE));
  });

  it('survives a node\'s removal sweep, even one naming its segment', async () => {
    await saveWorkspaceTree(11n, keptOf([...ESTATE, PLAN]));
    // A deletion the server names is data: one naming '#tree' is still not the account's sign-out.
    await forgetDeletedNodes(['plan', '#tree']);
    await forgetNodeDocuments(11n, ['plan', '#tree']);
    expect(store.has(workspaceTreeKey(11n))).toBe(true);
  });

  it('keeps no empty list over a fuller one, and calls a malformed value an error', () => {
    expect(treeToKeep({}, SAVED_AT)).toBeNull();
    expect(readCachedTree(undefined)).toBeNull();
    expect(() => readCachedTree({ savedAt: 'yesterday', nodes: {} })).toThrow('not in the shape');
    expect(() => readCachedTree({ savedAt: SAVED_AT, nodes: { plan: { ...PLAN, id: 'other' } } })).toThrow('node plan');
  });
});
