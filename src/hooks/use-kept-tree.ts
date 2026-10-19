/**
 * This account's last-known workspace tree, read from this device only while the server link
 * is down (the agent's reconnectingTo), and held as one of four answers: still reading, kept,
 * none kept, or kept but unreadable (said, never treated as none). The read goes through the
 * caller's port, so the rule is tested against the real seam and the view against a stand-in.
 */
import { useEffect, useState } from 'react';
import type { CachedWorkspaceTree } from '@/lib/offline-tree';
import type { DomainNode } from '@/components/layout/sidebar/tree-node-types';

export type KeptTree =
  | { readonly kind: 'unread' }
  | { readonly kind: 'kept'; readonly tree: CachedWorkspaceTree }
  | { readonly kind: 'none' }
  | { readonly kind: 'unreadable'; readonly message: string };

export type LoadKeptTree = (account: bigint) => Promise<CachedWorkspaceTree | null>;

const UNREAD: KeptTree = { kind: 'unread' };

export function useKeptTree(load: LoadKeptTree, account: bigint | null, linkDown: boolean): KeptTree {
  const [kept, setKept] = useState<KeptTree>(UNREAD);
  useEffect((): (() => void) | undefined => {
    setKept(UNREAD);
    if (!linkDown || account === null) return undefined;
    let live: boolean = true;
    load(account).then(
      (tree: CachedWorkspaceTree | null): void => { if (live) setKept(tree === null ? { kind: 'none' } : { kind: 'kept', tree }); },
      (error: unknown): void => { if (live) setKept({ kind: 'unreadable', message: error instanceof Error ? error.message : String(error) }); },
    );
    return (): void => { live = false; };
  }, [load, account, linkDown]);
  return kept;
}

/** The device's own: through the local-record seam, loaded on first use so the shell stays light. */
export const loadKeptTree: LoadKeptTree = async (account: bigint): Promise<CachedWorkspaceTree | null> =>
  (await import('@/lib/document-replica-cache')).loadWorkspaceTree(account);

/** Keeps a node list the server sent, as of `now`; the rule for what is kept is treeToKeep's. */
export type SaveKeptTree = (account: bigint, nodes: Readonly<Record<string, DomainNode>>, now: number) => Promise<void>;

/**
 * Keeps each node list the server sends for this account, once it has arrived (never the list
 * of a page still loading). A failed write is reported, never thrown into the page.
 */
export function useKeepWorkspaceTree(save: SaveKeptTree, account: bigint | undefined, nodes: Readonly<Record<string, DomainNode>>, loading: boolean): void {
  useEffect((): void => {
    if (account === undefined || loading) return;
    save(account, nodes, Date.now()).catch((error: unknown): void => console.warn('[useKeepWorkspaceTree] Keeping the workspace tree on this device failed:', error));
  }, [save, account, nodes, loading]);
}

/** Loaded on first use, with the rule, so the landing shell carries neither. */
export const saveKeptTree: SaveKeptTree = async (account: bigint, nodes: Readonly<Record<string, DomainNode>>, now: number): Promise<void> => {
  const [{ treeToKeep }, { saveWorkspaceTree }] = await Promise.all([import('@/lib/offline-tree'), import('@/lib/document-replica-cache')]);
  const tree: CachedWorkspaceTree | null = treeToKeep(nodes, now);
  if (tree !== null) await saveWorkspaceTree(account, tree);
};
