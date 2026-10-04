/**
 * Keeps a chat on its newest message while the reader is at the bottom, and
 * counts what they have not seen while they are not. A thin shell over
 * lib/chat-scroll/stick: it measures, dispatches, and scrolls; every decision
 * is the pure module's.
 *
 * One hook for both chats. The viewport is the Radix ScrollArea Viewport.
 */
import { useEffect, useLayoutEffect, useRef, useState, useCallback, type RefObject, type MutableRefObject } from 'react';
import { preferredScrollBehavior } from '@/lib/motion';
import { step, appendedSince, INITIAL_STICK, type StickState, type StickEvent, type StickStep } from '@/lib/chat-scroll/stick';

export interface StickToBottom {
  /** Messages that arrived while the reader was away from the bottom. */
  unseen: number;
  /** Scroll smoothly to the newest message and clear the count. */
  viewLatest: () => void;
  /**
   * viewLatest for the "View" button: also moves keyboard focus into the
   * message area, because the button unmounts and focus would fall to <body>,
   * sending the next Tab back to the top of the page.
   */
  reveal: () => void;
}

export function useStickToBottom<T extends { readonly id: string }>(
  viewportRef: RefObject<HTMLElement>,
  items: readonly T[],
  isOwn?: (item: T) => boolean,
): StickToBottom {
  const [unseen, setUnseen] = useState<number>(0);
  const state: MutableRefObject<StickState> = useRef<StickState>(INITIAL_STICK);
  const previous: MutableRefObject<readonly T[]> = useRef<readonly T[]>([]);
  const attached: MutableRefObject<HTMLElement | null> = useRef<HTMLElement | null>(null);
  const cleanup: MutableRefObject<(() => void) | null> = useRef<(() => void) | null>(null);
  // Read through a ref: callers pass an inline function, and a changing dependency would re-run the effect below every render.
  const ownRef: MutableRefObject<((item: T) => boolean) | undefined> = useRef(isOwn);
  ownRef.current = isOwn;

  const dispatch: (event: StickEvent) => void = useCallback((event: StickEvent): void => {
    const el: HTMLElement | null = attached.current;
    if (!el) return;
    const result: StickStep = step(state.current, event);
    state.current = result.state;
    setUnseen(result.state.unseen);
    if (result.scroll) el.scrollTo({ top: el.scrollHeight, behavior: preferredScrollBehavior() });
  }, []);

  // The viewport can be replaced (the P2P chat swaps it out for a document tab
  // and back), so the element is checked every render rather than once: no
  // dependency list on purpose, and cheap, as the first line returns when unchanged.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el: HTMLElement | null = viewportRef.current;
    if (el === attached.current) return;
    cleanup.current?.();
    cleanup.current = null;
    attached.current = el;
    state.current = INITIAL_STICK;
    setUnseen(0);
    if (!el) return;
    el.tabIndex = -1; // focusable by script only, so reveal() has somewhere to put focus
    el.scrollTop = el.scrollHeight; // a newly attached viewport opens on the latest
    const onScroll = (): void => dispatch({
      type: 'scrolled',
      geometry: { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight },
    });
    el.addEventListener('scroll', onScroll, { passive: true });
    // Late-sizing content (images) and a resized viewport re-pin after layout.
    const observer: ResizeObserver = new ResizeObserver((): void => dispatch({ type: 'resized' }));
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    cleanup.current = (): void => { el.removeEventListener('scroll', onScroll); observer.disconnect(); };
  });
  useEffect(() => (): void => cleanup.current?.(), []);

  // After layout, so scrollHeight already includes the new messages.
  useLayoutEffect(() => {
    const el: HTMLElement | null = viewportRef.current;
    const before: readonly T[] = previous.current;
    previous.current = items;
    if (!el || items.length === 0) return;
    if (before.length === 0) {
      el.scrollTop = el.scrollHeight; // first paint lands on the latest, without animation
      return;
    }
    const added: T[] = appendedSince(before, items);
    dispatch({ type: 'appended', count: added.length, own: ownRef.current ? added.some(ownRef.current) : false });
  }, [items, viewportRef, dispatch]);

  const viewLatest: () => void = useCallback((): void => dispatch({ type: 'view' }), [dispatch]);
  const reveal: () => void = useCallback((): void => {
    dispatch({ type: 'view' });
    attached.current?.focus({ preventScroll: true });
  }, [dispatch]);
  return { unseen, viewLatest, reveal };
}
