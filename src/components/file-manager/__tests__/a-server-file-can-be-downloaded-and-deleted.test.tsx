/**
 * A file in Server Storage offers Download and Delete.
 *
 * Measured live: once the tenant stored uploads, a server file's menu offered only
 * Info, Rename, Cut and Copy. The menu listed the states that allow each action by
 * hand -- Download for Remote, Delete for Remote or Hosted -- and ServerStored, which
 * the download handler and isDownloadableState already accepted, was in neither.
 */
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { VFSContextMenu } from '../VFSContextMenu';
import { RevfsFileState, type RevfsNode } from '@/types/revfs-types';

function menuFor(fileState: RevfsFileState): string[] {
  const node: RevfsNode = { name: 'srv.bin', path: '/srv.bin', type: 'file', fileState } as RevfsNode;
  const noop = (): void => {};
  render(
    <VFSContextMenu node={node} onNewFolder={noop} onDelete={noop} onDownload={noop} onUploadFile={noop} onInfo={noop}>
      <div>srv.bin</div>
    </VFSContextMenu>,
  );
  fireEvent.contextMenu(screen.getByText('srv.bin'));
  return screen.getAllByRole('menuitem').map((item: HTMLElement): string => item.textContent ?? '');
}

describe('a file context menu', () => {
  it('lets the owner download and delete a server-stored file', () => {
    const items: string[] = menuFor(RevfsFileState.ServerStored);
    expect(items.some((t: string) => /^Download/.test(t))).toBe(true);
    expect(items.some((t: string) => /^Delete/.test(t))).toBe(true);
  });

  it('still offers a hosted file for deletion but not for download', () => {
    const items: string[] = menuFor(RevfsFileState.Hosted);
    expect(items.some((t: string) => /^Download/.test(t))).toBe(false);
    expect(items.some((t: string) => /^Delete/.test(t))).toBe(true);
  });
});
