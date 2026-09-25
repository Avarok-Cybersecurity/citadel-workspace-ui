/**
 * The grid's keyboard shortcuts are discoverable, and do not fire from inside
 * a dialog; and selecting a file does not download it.
 *
 * - F2, Delete and Ctrl+X/C/V/A worked, and nothing on screen said so.
 * - With a dialog open over the grid, Delete and Backspace reached the grid's
 *   document-level handler and acted on the selection behind the dialog.
 * - A single click on a file both selected it and started a download, so
 *   selecting a file to cut or inspect pulled it from the peer.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevfsFileState, type RevfsNode } from '@/types/revfs-types';
import { VFSContentGrid } from '../VFSContentGrid';
import { shortcutLabel, VFS_SHORTCUTS, matchesShortcut } from '../vfs-shortcuts';

function file(name: string): RevfsNode {
  return {
    name, path: `/${name}`, type: 'file', fileState: RevfsFileState.Remote, createdAt: 0, updatedAt: 0,
    fileMetadata: { fileId: name, fileName: name, fileSize: 1, fileType: '', virtualDirectory: `/${name}`, uploadedByCid: 1n },
  };
}
const tree: RevfsNode = { name: '', path: '/', type: 'directory', children: [file('a.txt')], createdAt: 0, updatedAt: 0 };

const noop = (): void => {};
const anoop = async (): Promise<void> => {};

function grid(handlers: { onDelete?: (n: RevfsNode) => void; onDownload?: (n: RevfsNode) => void; onSelect?: () => void }, selected: Set<string>): void {
  render(
    <>
      <VFSContentGrid
        tree={tree} currentPath="/" onNavigate={noop} onNewFolder={noop}
        onDelete={handlers.onDelete ?? noop} onDownload={handlers.onDownload ?? noop}
        onUploadFile={noop} onInfo={noop} onRename={anoop} onCut={noop} onCopy={noop}
        onPaste={anoop} onDrop={noop} selectedPaths={selected} onSelect={handlers.onSelect ?? noop}
      />
      <div role="dialog"><button>Cancel</button></div>
    </>,
  );
}

describe('grid shortcuts', () => {
  it('delete the selection from the grid', () => {
    const onDelete: ReturnType<typeof vi.fn> = vi.fn();
    grid({ onDelete }, new Set(['/a.txt']));
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('do nothing when the key was pressed inside a dialog', () => {
    const onDelete: ReturnType<typeof vi.fn> = vi.fn();
    grid({ onDelete }, new Set(['/a.txt']));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Backspace' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Delete' });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('are named in the context menu with the keys the handler answers', () => {
    grid({}, new Set());
    fireEvent.contextMenu(screen.getByText('a.txt'));
    const rename: HTMLElement = screen.getByRole('menuitem', { name: /Rename/ });
    expect(rename).toHaveTextContent('F2');
    expect(rename).toHaveAttribute('aria-keyshortcuts', 'F2');
    expect(screen.getByRole('menuitem', { name: /Cut/ })).toHaveTextContent(shortcutLabel(VFS_SHORTCUTS.cut, false));
    expect(screen.getByRole('menuitem', { name: /Copy/ })).toHaveTextContent('Ctrl+C');
    expect(screen.getByRole('menuitem', { name: /^Delete/ })).toHaveTextContent('Del');
  });

  it('label the modifier the platform uses', () => {
    expect(shortcutLabel(VFS_SHORTCUTS.paste, true)).toBe('⌘V');
    expect(shortcutLabel(VFS_SHORTCUTS.paste, false)).toBe('Ctrl+V');
    expect(matchesShortcut({ key: 'v', ctrlKey: false, metaKey: true }, VFS_SHORTCUTS.paste)).toBe(true);
    expect(matchesShortcut({ key: 'v', ctrlKey: false, metaKey: false }, VFS_SHORTCUTS.paste)).toBe(false);
  });
});

describe('every shortcut the menu names', () => {
  it('reaches its action', () => {
    const on: Record<string, ReturnType<typeof vi.fn>> = {
      copy: vi.fn(), cut: vi.fn(), paste: vi.fn(async (): Promise<void> => {}), all: vi.fn(), clear: vi.fn(),
    };
    render(
      <VFSContentGrid
        tree={tree} currentPath="/" onNavigate={noop} onNewFolder={noop} onDelete={noop} onDownload={noop}
        onUploadFile={noop} onInfo={noop} onRename={anoop} onCut={on.cut} onCopy={on.copy}
        onPaste={on.paste} onDrop={noop} selectedPaths={new Set(['/a.txt'])} hasPasteItems
        onSelectAll={on.all} onClearSelection={on.clear}
      />,
    );
    fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'x', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(on.copy).toHaveBeenCalledTimes(1);
    expect(on.cut).toHaveBeenCalledTimes(1);
    expect(on.paste).toHaveBeenCalledWith('/');
    expect(on.all).toHaveBeenCalledTimes(1);
    expect(on.clear).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: 'F2' });
    expect(screen.getByRole('textbox')).toHaveValue('a.txt');
  });
});

describe('opening a file', () => {
  it('is not what a click does: a click selects', () => {
    const onDownload: ReturnType<typeof vi.fn> = vi.fn();
    const onSelect: ReturnType<typeof vi.fn> = vi.fn();
    grid({ onDownload, onSelect }, new Set());
    fireEvent.click(screen.getByText('a.txt'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('is what a double-click or Enter does', () => {
    const onDownload: ReturnType<typeof vi.fn> = vi.fn();
    grid({ onDownload }, new Set());
    fireEvent.doubleClick(screen.getByText('a.txt'));
    fireEvent.keyDown(screen.getByTitle(/a\.txt/), { key: 'Enter' });
    expect(onDownload).toHaveBeenCalledTimes(2);
  });
});
