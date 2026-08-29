import { describe, it, expect } from 'vitest';
import type { FlashComment } from '@/components/p2p/collaborator-cursor-helpers';
import {
  buildContextMenuFlashComment,
  generateFlashCommentId,
  hexToRgba,
} from '../collaborator-cursor-helpers';

/**
 * Tests for `buildContextMenuFlashComment` — the empty-text guard the
 * reviewer flagged. The prior CollaborativeEditor handler built a
 * `FlashComment` with `text: ''` and emitted it unconditionally; remote
 * collaborators then rendered an empty flash bubble at the cursor
 * position. Extracting the build logic into a pure helper lets us pin
 * the contract here (mirrors the cursor-tooltip path's
 * `text && words.length <= 100` guard from `CollaboratorCursor.tsx`).
 *
 * The matching context-menu emission is in
 * `CollaborativeEditor.tsx#handleFlashCommentFromContextMenu`.
 */
describe('buildContextMenuFlashComment', () => {
  const coords: { top: number; left: number; } = { top: 100, left: 200 };
  const user: { userId: string; userName: string; userColor: string; } = { userId: 'cid-123', userName: 'Alice', userColor: '#ff0000' };

  it('returns null when text is null', () => {
    expect(buildContextMenuFlashComment(null, coords, user)).toBeNull();
  });

  it('returns null when text is undefined (window.prompt cancel)', () => {
    expect(buildContextMenuFlashComment(undefined, coords, user)).toBeNull();
  });

  it('returns null when text is the empty string', () => {
    expect(buildContextMenuFlashComment('', coords, user)).toBeNull();
  });

  it('returns null when text is only whitespace', () => {
    expect(buildContextMenuFlashComment('   \t\n  ', coords, user)).toBeNull();
  });

  it('trims surrounding whitespace from non-empty text', () => {
    const c: FlashComment | null = buildContextMenuFlashComment('  hello world  ', coords, user);
    expect(c).not.toBeNull();
    expect(c?.text).toBe('hello world');
  });

  it('embeds user identity and cursor coords in the returned comment', () => {
    const c: FlashComment | null = buildContextMenuFlashComment('hi', coords, user);
    expect(c).not.toBeNull();
    expect(c?.userId).toBe('cid-123');
    expect(c?.userName).toBe('Alice');
    expect(c?.userColor).toBe('#ff0000');
    expect(c?.position).toEqual(coords);
  });

  it('generates a flash-id with the same prefix as generateFlashCommentId', () => {
    // Avoid testing the exact id (random + timestamp) — just the prefix
    // contract, which is what UI rendering keys on.
    const c: FlashComment | null = buildContextMenuFlashComment('hi', coords, user);
    expect(c?.id).toMatch(/^flash-/);
    expect(generateFlashCommentId()).toMatch(/^flash-/);
  });

  it('stamps a timestamp close to now', () => {
    const before: number = Date.now();
    const c: FlashComment | null = buildContextMenuFlashComment('hi', coords, user);
    const after: number = Date.now();
    expect(c?.timestamp).toBeGreaterThanOrEqual(before);
    expect(c?.timestamp).toBeLessThanOrEqual(after);
  });
});

describe('hexToRgba (existing helper, included for module coverage)', () => {
  it('converts hex to rgba with given alpha', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('returns the original value when not a valid hex', () => {
    // Documents the fallback: hexToRgba is intentionally permissive on
    // bad input rather than throwing, so a malformed color string
    // doesn't crash cursor rendering.
    expect(hexToRgba('not-a-hex', 0.5)).toBe('not-a-hex');
  });
});
