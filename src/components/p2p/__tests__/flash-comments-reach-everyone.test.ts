import { describe, it, expect } from 'vitest';
import { flashCommentsFrom, type FlashComment } from '../collaborator-cursor-helpers';

/**
 * The flash-comment dialog promises "Shown to everyone in the document". The
 * sender was the exception: their own comment was filtered out by comparing
 * display names, so they never saw it land -- and a collaborator who happened
 * to share their display name was hidden too.
 */
const comment: (id: string, userName: string) => FlashComment = (id: string, userName: string): FlashComment => ({
  id, userId: `cid-${id}`, userName, userColor: '#000000', text: `text ${id}`, position: { top: 1, left: 2 }, timestamp: 3,
});

describe('flashCommentsFrom', () => {
  it("includes the reader's own comment", () => {
    const states: Map<number, unknown> = new Map<number, unknown>([
      [1, { user: { name: 'Lara Lead', color: '#111111' }, flashComment: comment('a', 'Lara Lead') }],
    ]);
    expect(flashCommentsFrom(states).map((c: FlashComment) => c.id)).toEqual(['a']);
  });

  it('keeps two collaborators who share a display name', () => {
    const states: Map<number, unknown> = new Map<number, unknown>([
      [1, { user: { name: 'Sam', color: '#111111' }, flashComment: comment('a', 'Sam') }],
      [2, { user: { name: 'Sam', color: '#222222' }, flashComment: comment('b', 'Sam') }],
    ]);
    expect(flashCommentsFrom(states).map((c: FlashComment) => c.id)).toEqual(['a', 'b']);
  });

  it("labels each comment with its author's awareness name and colour", () => {
    const states: Map<number, unknown> = new Map<number, unknown>([
      [7, { user: { name: 'Max Member', color: '#abcdef' }, flashComment: comment('m', 'stale') }],
    ]);
    const [c] = flashCommentsFrom(states);
    expect([c.userName, c.userColor]).toEqual(['Max Member', '#abcdef']);
  });

  it('skips states with no comment or a cleared one', () => {
    const states: Map<number, unknown> = new Map<number, unknown>([
      [1, { user: { name: 'A', color: '#111111' } }],
      [2, { user: { name: 'B', color: '#222222' }, flashComment: null }],
    ]);
    expect(flashCommentsFrom(states)).toEqual([]);
  });
});
