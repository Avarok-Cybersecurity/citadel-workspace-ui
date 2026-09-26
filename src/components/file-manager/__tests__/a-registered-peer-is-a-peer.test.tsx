/**
 * The file manager lists the peers the rest of the app lists.
 *
 * It read the registration service's in-memory cache, which only a
 * registration seen in THIS tab fills, and a CID from the global connection,
 * which a tab that resumed its session lacks for seconds. So with a registered,
 * online peer it showed "Connecting..." and then "No Peers Connected".
 *
 * Mocked: `useRegisteredPeers` and `getCurrentCid` query the agent, and the two
 * tree hooks open RE-VFS sessions. What is under test is which sources the file
 * manager reads and what it decides from them.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TreeScope } from '@/types/revfs-types';
import { fileManagerScreen, type FileManagerScreenInputs } from '../file-manager-screen';

const noTree: Record<string, unknown> = vi.hoisted((): Record<string, unknown> => {
  const ok = (): Promise<boolean> => Promise.resolve(true);
  return {
    tree: null, loading: true, error: null, storageUsed: 0, storageQuota: 0, revfsEnabled: true,
    mkdir: ok, rmdir: ok, uploadFile: ok, downloadFile: (): Promise<undefined> => Promise.resolve(undefined),
    removeFile: ok, rename: ok, move: ok, copy: ok, refresh: (): Promise<void> => Promise.resolve(),
  };
});

vi.mock('@/hooks/use-registered-peers', () => ({
  useRegisteredPeers: (): Record<string, unknown> => ({
    registeredPeers: [{ cid: '42', username: 'Bob Stone', isOnline: true, isConnected: true, connectionPath: null }],
    isLoading: false,
    refreshPeers: (): Promise<void> => Promise.resolve(),
  }),
}));
vi.mock('@/lib/p2p/current-cid', () => ({
  getCurrentCid: (): Promise<bigint> => Promise.resolve(7n),
}));
vi.mock('@/hooks/useRevfsTree', () => ({
  useRevfsTree: (): Record<string, unknown> => noTree,
  useServerRevfsTree: (): Record<string, unknown> => noTree,
}));

import { useFileManagerContent } from '../useFileManagerContent';
import { PromptDialogProvider } from '@/components/shared/prompt-dialog';
import { ConfirmDialogProvider } from '@/components/shared/confirm-dialog';
import type { ReactNode } from 'react';

describe('the file manager', () => {
  it('knows its own session and selects the registered peer', async () => {
    const { result } = renderHook(() => useFileManagerContent(), {
      wrapper: ({ children }: { children: ReactNode }): JSX.Element => <ConfirmDialogProvider><PromptDialogProvider>{children}</PromptDialogProvider></ConfirmDialogProvider>,
    });

    await waitFor(() => expect(result.current.myCid).toBe(7n));
    expect(result.current.registeredPeers).toEqual([{ cid: 42n, username: 'Bob Stone' }]);
    await waitFor(() => expect(result.current.selectedPeerCid).toBe(42n));
  });
});

describe('which screen it shows', () => {
  const base: FileManagerScreenInputs = {
    myCid: 7n, storageMode: TreeScope.Peer, peersLoading: false, peerCount: 1,
    selectedPeerCid: 42n, treeLoading: false, hasError: false, hasTree: true,
  };

  it('does not say "no peers" while the list is still loading', () => {
    expect(fileManagerScreen({ ...base, peerCount: 0, peersLoading: true, selectedPeerCid: null })).toBe('finding-peers');
  });

  it('does not say "no peers" in the moment before a peer is selected', () => {
    expect(fileManagerScreen({ ...base, selectedPeerCid: null })).toBe('finding-peers');
  });

  it('says "no peers" only when the loaded list is empty', () => {
    expect(fileManagerScreen({ ...base, peerCount: 0, selectedPeerCid: null })).toBe('no-peers');
  });

  it('needs no peer for server storage', () => {
    expect(fileManagerScreen({ ...base, storageMode: TreeScope.Server, peerCount: 0, selectedPeerCid: null })).toBe('browser');
  });
});
