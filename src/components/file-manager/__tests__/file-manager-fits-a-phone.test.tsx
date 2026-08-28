/**
 * The file manager was the one post-auth surface with no mobile design, and the
 * failures compounded: a storage bar with neither wrap nor scroll put peers
 * beyond the first outside the viewport — clipped by `main`'s `overflow-x-hidden`
 * with no way to scroll to them — so a phone user could not switch which peer's
 * storage they were browsing at all.
 *
 * These assert the CLASSES that produce the behaviour, because jsdom has no
 * layout: `getBoundingClientRect` is all zeros, so a geometric assertion here
 * would pass on any markup whatsoever. Real geometry is the integration suite's
 * job; this pins the mechanism against a future edit that removes it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@/test-utils/strip-comments';

const read = (p: string) => stripComments(readFileSync(join(process.cwd(), p), 'utf8'));

describe('the storage bar', () => {
  const source: string = read('src/components/file-manager/FileManagerStorageBar.tsx');

  it('wraps instead of clipping its peer list', () => {
    expect(source).toMatch(/flex flex-wrap items-center/);
  });

  it('lets the peer group shrink and scroll within the row', () => {
    expect(source).toMatch(/flex min-w-0 flex-1 items-center gap-2 overflow-x-auto/);
  });
});

describe('the tree pane', () => {
  it('is hidden below md so the grid gets the whole phone', () => {
    const source: string = read('src/components/file-manager/VFSTreeView.tsx');
    expect(source).toMatch(/hidden w-52 shrink-0 [^"]*md:flex/);
  });
});

describe('the toolbar', () => {
  const source: string = read('src/components/file-manager/VFSToolbar.tsx');

  it('has a shrinkable filter, so breadcrumbs keep room', () => {
    expect(source).toMatch(/w-full min-w-0 max-w-32/);
    expect(source, 'a rigid w-32 squeezed the breadcrumbs to nothing').not.toMatch(/h-7 w-32 /);
  });

  it('gives the clear button a 24px target', () => {
    expect(source).toMatch(/h-6 w-6[^"]*place-items-center/);
  });
});

describe('the P2P chat header', () => {
  it('can actually truncate a long peer name', () => {
    const source: string = read('src/components/p2p/P2PChatHeader.tsx');
    // The truncate was inert without this: a flex item defaults to
    // min-width:auto and never narrows below max-content.
    expect(source).toMatch(/<div className="min-w-0">\s*<h3 className="truncate/);
  });
});
