/**
 * The file-manager filter must not travel with the user, and an empty result
 * must not be reported as an empty folder.
 *
 * `filterText` matches only the current directory's immediate children, and it
 * persisted across folder navigation, peer switches and storage-mode switches.
 * When it then matched nothing, the grid rendered:
 *
 *   "This folder is empty"
 *   "Drag files here or right-click to create a folder"
 *
 * about a folder with files in it. The filter box is 32px wide in the top-right
 * corner, so there was nothing on screen to explain where the files went.
 *
 * The sibling selection-clearing effect already lists exactly the right
 * dependencies — currentPath, storageMode, selectedPeerCid — and its comment
 * explains why a stale selection is destructive. The filter was simply never
 * added to the same treatment.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VFSContentGrid } from '../VFSContentGrid';
import type { RevfsNode } from "@/types/revfs-types";

function file(name: string): RevfsNode {
  return { name, path: `/docs/${name}`, type: 'file', size: 10 } as unknown as RevfsNode;
}

/** The whole tree; the grid resolves `currentPath` inside it. */
function treeWith(children: RevfsNode[]): RevfsNode {
  return {
    name: '',
    path: '/',
    type: 'directory',
    children: [{ name: 'docs', path: '/docs', type: 'directory', children }],
  } as unknown as RevfsNode;
}

const noop = (): void => {};
const asyncNoop = async (): Promise<void> => {};
/** Everything the grid needs that this test does not exercise. */
const props = {
  currentPath: '/docs',
  onNavigate: noop,
  onNewFolder: noop,
  onDelete: noop,
  onDownload: noop,
  onUploadFile: noop,
  onInfo: noop,
  onRename: asyncNoop,
  onCut: noop,
  onCopy: noop,
  onPaste: asyncNoop,
  onDrop: noop,
};

describe('the file grid with nothing to show', () => {
  it('says the folder is empty only when it IS empty', () => {
    render(<VFSContentGrid {...props} tree={treeWith([])} />);

    expect(screen.getByText(/this folder is empty/i)).toBeInTheDocument();
  });

  it('says the FILTER matched nothing when a filter is active', () => {
    render(
      <VFSContentGrid
        {...props}
        tree={treeWith([file('invoice.pdf'), file('notes.md')])}
        filterText="zzz-no-such-file"
      />
    );

    // Reporting "empty" here tells the user their files are gone.
    expect(screen.queryByText(/this folder is empty/i)).toBeNull();
    expect(screen.getByText(/matches/i)).toBeInTheDocument();
    expect(screen.getByText(/zzz-no-such-file/)).toBeInTheDocument();
  });
});
