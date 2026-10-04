import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The editor chunk must not load with the chat.
 *
 * The factory below runs when `LiveDocumentView` is first imported, i.e. when the
 * lazy boundary is first rendered -- so `loaded` counts evaluations of the editor
 * subtree. Mocked: the view's body (the real one needs the whole workspace context);
 * the Suspense/lazy boundary under test is production code.
 */
const loaded: { count: number } = { count: 0 };
vi.mock('../LiveDocumentView', () => {
  loaded.count += 1;
  return { LiveDocumentView: (): JSX.Element => <div data-testid="editor-ready">editor</div> };
});

const { LiveDocumentPane } = await import('../LiveDocumentPane');

const props: React.ComponentProps<typeof LiveDocumentPane> = {
  documentId: 'd', documentTitle: 'T', peerCid: '1', peerName: 'P', linkUp: true,
  currentUserCid: '2', currentUserName: 'Me', onRename: async (): Promise<void> => undefined,
};

describe('lazy editor', () => {
  it('is not loaded by importing the pane, only by opening a document', async () => {
    expect(loaded.count).toBe(0);
    render(<LiveDocumentPane {...props} />);
    expect(screen.getByTestId('live-doc-loading')).toBeInTheDocument(); // skeleton first
    expect(await screen.findByTestId('editor-ready')).toBeInTheDocument();
    expect(loaded.count).toBe(1);
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full: string = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('nothing imports the editor statically', () => {
  it('only the lazy pane names LiveDocumentView/CollaborativeEditor, and only via import()', () => {
    const offenders: string[] = sources(join(__dirname, '../../..')).filter((file) => {
      if (file.endsWith('LiveDocumentPane.tsx') || file.endsWith('LiveDocumentView.tsx')) return false;
      return /^import[^;]*from\s+['"][^'"]*\/(LiveDocumentView|CollaborativeEditor)['"]/m.test(readFileSync(file, 'utf8'));
    });
    expect(offenders).toEqual([]);
  });
});
