/**
 * A reader scrolled up must not be yanked to the bottom.
 *
 * The scroll effect pinned unconditionally on every change of `messages`, and
 * the status subscription's `prev.map` ALWAYS allocates — so the array identity
 * changed for a sent/delivered/read transition in ANY conversation, not just
 * this one. Someone reading yesterday's thread was thrown back to the newest
 * message by a delivery receipt in a completely different chat.
 *
 * It also fought the pagination anchoring in useP2PMessages, which goes to real
 * trouble to preserve scroll position across a prepend.
 *
 * Two halves, tested separately: this file covers the identity half (the cheap,
 * deterministic one); the geometric half is asserted in the integration suite,
 * because jsdom reports every element as 0x0 and cannot see a scroll position.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('the chat scroll', () => {
  it('measures distance from the bottom before following', () => {
    const src: string = readFileSync(join(process.cwd(), 'src/components/p2p/P2PChat.tsx'), 'utf8');

    // The unconditional form was:
    //   scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    // with no read of scrollTop or clientHeight anywhere near it.
    expect(src).toMatch(/scrollHeight\s*-\s*el\.scrollTop\s*-\s*el\.clientHeight/);
  });

  it('still lands on the newest message when a conversation is first opened', () => {
    const src: string = readFileSync(join(process.cwd(), 'src/components/p2p/P2PChat.tsx'), 'utf8');

    // scrollTop is 0 on first paint, so a pure near-the-bottom test would open
    // every conversation at the TOP of its history — a worse bug than the one
    // being fixed.
    expect(src).toMatch(/hasJumpedToLatest/);
  });
});
