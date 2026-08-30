/**
 * Deleting asks first, and a refusal deletes nothing.
 *
 * Both destructive file-manager paths sit behind `confirm({...})`, and neither
 * is exercised by any spec -- `handleDeleteMultiple` is reached by no
 * integration test at all. That matters more than it sounds: round 417 found a
 * deregistration that silently did nothing for weeks because the spec never
 * answered its second dialog, while three checks reported success. A guard
 * nothing tests is a guard nobody knows the state of.
 *
 * These are unit tests because the hook takes its dependencies as parameters:
 * `rmdir`, `removeFile` and `confirm` are all injectable, so the real handler
 * runs and only the boundary is stubbed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { RevfsNode } from '@/types/revfs-types';

let answer: boolean = true;
vi.mock('@/components/shared/confirm-dialog', () => ({
  useConfirm: (): (() => Promise<boolean>) => async (): Promise<boolean> => answer,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The hook also asks for a prompt (rename). Stubbed at the same boundary as
// `confirm`, so the handler under test is the real one.
vi.mock('@/components/shared/prompt-dialog', () => ({
  usePrompt: (): (() => Promise<string | null>) => async (): Promise<string | null> => null,
}));

const rmdir: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<void> => {});
const removeFile: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<void> => {});

function node(path: string, type: 'directory' | 'file'): RevfsNode {
  return { path, name: path.split('/').pop() ?? path, type, children: [] } as unknown as RevfsNode;
}

async function handlers(): Promise<ReturnType<typeof import('../useFileManagerHandlers')['useFileManagerHandlers']>> {
  const { useFileManagerHandlers } = await import('../useFileManagerHandlers');
  const noop: () => void = (): void => {};
  const anoop: () => Promise<void> = async (): Promise<void> => {};
  return renderHook(() =>
    useFileManagerHandlers({
      mkdir: anoop, rmdir, removeFile,
      downloadFile: async (): Promise<string | undefined> => undefined,
      uploadFile: anoop, rename: anoop, move: anoop, copy: anoop, refresh: anoop,
      cut: noop, copyToClipboard: noop, clearClipboard: noop, clearSelection: noop, selectAll: noop,
      currentTreeKey: null, hasPasteItems: false, clipboard: null, isCut: false,
      myCid: 1n, storageUsed: 0, storageQuota: 1000, revfsEnabled: true,
      storageMode: 'peer', selectedPeerCid: 2n,
      tree: null, currentPath: '/', filterText: '',
      fileInputRef: { current: null },
      setUploadTargetDir: noop, setRevfsDisabledReason: noop,
      setRevfsDisabledModalOpen: noop, setAttemptedFileSize: noop,
      setStorageLimitModalOpen: noop, setPropertiesNode: noop,
    } as unknown as Parameters<typeof useFileManagerHandlers>[0]),
  ).result.current;
}

describe('deleting one item', () => {
  beforeEach(() => { rmdir.mockClear(); removeFile.mockClear(); answer = true; });

  it('deletes nothing when the question is refused', async () => {
    answer = false;
    const h: Awaited<ReturnType<typeof handlers>> = await handlers();
    await h.handleDelete(node('/notes', 'directory'));
    await h.handleDelete(node('/a.txt', 'file'));
    expect(rmdir).not.toHaveBeenCalled();
    expect(removeFile).not.toHaveBeenCalled();
  });

  it('routes a folder to rmdir and a file to removeFile', async () => {
    // Positive control: the guard must not block an accepted deletion, and the
    // two kinds must not be swapped.
    const h: Awaited<ReturnType<typeof handlers>> = await handlers();
    await h.handleDelete(node('/notes', 'directory'));
    await h.handleDelete(node('/a.txt', 'file'));
    expect(rmdir).toHaveBeenCalledWith('/notes');
    expect(removeFile).toHaveBeenCalledWith('/a.txt');
  });
});

describe('deleting a selection', () => {
  beforeEach(() => { rmdir.mockClear(); removeFile.mockClear(); answer = true; });

  it('deletes nothing when the question is refused', async () => {
    answer = false;
    const h: Awaited<ReturnType<typeof handlers>> = await handlers();
    await h.handleDeleteMultiple([node('/notes', 'directory'), node('/a.txt', 'file')]);
    expect(rmdir).not.toHaveBeenCalled();
    expect(removeFile).not.toHaveBeenCalled();
  });

  it('routes each item by its own kind', async () => {
    const h: Awaited<ReturnType<typeof handlers>> = await handlers();
    await h.handleDeleteMultiple([node('/notes', 'directory'), node('/a.txt', 'file')]);
    expect(rmdir).toHaveBeenCalledWith('/notes');
    expect(removeFile).toHaveBeenCalledWith('/a.txt');
  });
});
