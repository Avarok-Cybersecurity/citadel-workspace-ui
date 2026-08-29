/**
 * "This folder is empty" was said about folders that were not there.
 *
 * `VFSContentGrid` derives its list from `findNodeByPath(tree, currentPath)`
 * and then `currentNode?.children ?? []`. A path that is not in the tree — the
 * folder was renamed or deleted somewhere else while it was open — produced an
 * empty list, and the empty list rendered as "This folder is empty. Drag files
 * here or right-click to create a folder", inviting the user to drop into a
 * folder that no longer exists.
 *
 * The file already carried the right instinct one case over:
 *
 *   "Empty" and "nothing matched your filter" are different facts, and stating
 *   the first when the second is true tells the user their files are gone.
 *
 * There were three facts and it distinguished two.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RevfsNode } from '@/types/revfs-types';
import { VFSContentGrid } from '../VFSContentGrid';

function dir(path: string, name: string, children: RevfsNode[] = []): RevfsNode {
  return { path, name, type: 'directory', children, updatedAt: 0 } as unknown as RevfsNode;
}

const tree: RevfsNode = dir('/', 'root', [dir('/docs', 'docs', [])]);

const noop = (): void => {};
const asyncNoop = async (): Promise<void> => {};

function grid(currentPath: string, onNavigate: (p: string) => void = noop): ReturnType<typeof render> {
  return render(
    <VFSContentGrid
      tree={tree}
      currentPath={currentPath}
      onNavigate={onNavigate}
      onNewFolder={noop}
      onDelete={noop}
      onDownload={noop}
      onUploadFile={noop}
      onInfo={noop}
      onRename={asyncNoop}
      onCut={noop}
      onCopy={noop}
      onPaste={asyncNoop}
      onDrop={noop}
    />,
  );
}

describe('the file grid', () => {
  it('says a folder that exists and holds nothing is empty', () => {
    // The positive control. Without it, "a missing folder is not called empty"
    // would pass on a grid that never says "empty" at all.
    grid('/docs');
    expect(screen.getByText(/this folder is empty/i)).toBeTruthy();
    expect(screen.queryByTestId('vfs-folder-gone')).toBeNull();
  });

  it('does not call a folder that is not there empty', () => {
    grid('/gone');
    expect(screen.queryByText(/this folder is empty/i)).toBeNull();
    expect(screen.getByTestId('vfs-folder-gone')).toBeTruthy();
    expect(screen.getByText(/no longer here/i)).toBeTruthy();
  });

  it('offers a way out of a folder that is not there', () => {
    // Otherwise the user is looking at a phantom folder with nothing to do.
    const onNavigate: ReturnType<typeof vi.fn> = vi.fn();
    grid('/gone', onNavigate);
    return userEvent.click(screen.getByRole('button', { name: /top level/i })).then((): void => {
      expect(onNavigate).toHaveBeenCalledWith('/');
    });
  });
});
