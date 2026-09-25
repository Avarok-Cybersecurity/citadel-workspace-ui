/**
 * Moved out of P2PChat.tsx, which was at the 250-line ceiling. Verbatim but for
 * the signature and `scrollRef` joining the dependency list.
 */
import React, { useEffect, useRef } from 'react';
import type { P2PMessage } from '@/lib/p2p/p2p-types';

// Follow the conversation only when the reader is already at the bottom.
//
// This used to pin unconditionally on every change of `messages`, so someone
// scrolled up reading yesterday's thread was yanked back down by any new
// message — and, because the status subscription allocated a new array
// regardless of whether the id was in THIS conversation, by any
// sent/delivered/read transition anywhere in the messenger.
//
// It also fought the pagination anchoring in useP2PMessages, which goes to
// real trouble to preserve scroll position across a prepend.
export function useFollowLatest(scrollRef: React.RefObject<HTMLDivElement>, messages: P2PMessage[]): void {
  const FOLLOW_THRESHOLD_PX: number = 80;
  const hasJumpedToLatest: React.MutableRefObject<boolean> = useRef(false);
  useEffect(() => {
    const el: HTMLDivElement | null = scrollRef.current;
    if (!el || messages.length === 0) return;

    // The first paint of a conversation must land on the newest message —
    // scrollTop is 0 there, so a pure "am I near the bottom" test would open
    // every conversation at the top of its history. P2PChat is keyed by peer,
    // so this ref resets when the conversation changes.
    if (!hasJumpedToLatest.current) {
      hasJumpedToLatest.current = true;
      el.scrollTop = el.scrollHeight;
      return;
    }

    const distanceFromBottom: number = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom <= FOLLOW_THRESHOLD_PX) {
      el.scrollTop = el.scrollHeight;
    }
    // scrollRef is the caller's stable useRef; listed only because the linter
    // cannot see that across the hook boundary.
  }, [messages, scrollRef]);
}
