/**
 * The focused tree's motion: nothing in it jumps.
 *
 * Selecting a node moves rows between three lists -- a child becomes a sibling,
 * a sibling becomes an ancestor -- and each list is its own <ul>, so React
 * mounts a new element for the row in its new place. Every row carries its node
 * id as a framer `layoutId`, so the new element starts where the old one was and
 * glides (FLIP); `layout="position"` moves it without scaling it, because a
 * 22px ancestor row and a 30px sibling row would otherwise squash their text on
 * the way. Rows that arrive or leave fade -- popped out of the flow while they
 * do (AnimatePresence `popLayout`), so a ghost never holds open the space the
 * others are gliding into -- and an unfolding child list grows from nothing in
 * height and opacity. Boxes whose contents change size (the stack, the whole
 * tree) follow by height, so what sits below them is carried, not jumped.
 *
 * Durations come from MOTION_SECONDS and are applied once, here, through
 * MotionConfig; no element sets its own, so switching motion off is one switch.
 * It is off -- every duration zero, transforms not animated at all -- when the
 * OS asks for reduced motion or the user turned Animations off.
 *
 * A row that is leaving stays in the DOM for its fade, while its replacement is
 * already mounted in the new list. For those few frames the same node would be
 * on screen twice: two `tree-node-<id>`s for a spec to trip over, two treeitems
 * for a screen reader, two buttons for a click. So a leaving row -- or any row
 * inside something leaving, which framer's own presence does not report --
 * drops its testid and role, hides from assistive tech and takes no pointer.
 */
import { createContext, useContext, useLayoutEffect, useRef, useState, type Context, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useIsPresent, type Transition } from 'framer-motion';
import { MOTION_SECONDS } from '@/lib/motion';
import { useMotionAllowed } from '@/hooks/use-motion-allowed';

const MOVING: Transition = { duration: MOTION_SECONDS.fade, layout: { duration: MOTION_SECONDS.layout, ease: [0.2, 0, 0, 1] } };
const STILL: Transition = { duration: 0, layout: { duration: 0 } };

/**
 * The classes SidebarMenuItem gives its <li>, for the `motion.li` rows that
 * stand in for it: `group/menu-item` is what SidebarMenuButton's variants key on.
 */
export const ITEM_CLASS: string = 'group/menu-item relative';

/** What a row does when it arrives, moves and leaves. */
export const ROW_MOTION: {
  readonly layout: 'position';
  readonly initial: { readonly opacity: number };
  readonly animate: { readonly opacity: number };
  readonly exit: { readonly opacity: number };
} = { layout: 'position', initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

const Leaving: Context<boolean> = createContext<boolean>(false);

/** True while this row, or anything it sits inside, is animating out. */
export function useLeaving(): boolean {
  const present: boolean = useIsPresent();
  return useContext(Leaving) || !present;
}

/** Passes "leaving" down to rows nested inside a presence child. */
export function PresenceScope({ children }: { children: ReactNode }): JSX.Element {
  const leaving: boolean = useLeaving();
  return <Leaving.Provider value={leaving}>{children}</Leaving.Provider>;
}

export function TreeMotion({ children }: { children: ReactNode }): JSX.Element {
  const allowed: boolean = useMotionAllowed();
  return (
    <MotionConfig reducedMotion={allowed ? 'never' : 'always'} transition={allowed ? MOVING : STILL}>
      <LayoutGroup id="focused-tree">{children}</LayoutGroup>
    </MotionConfig>
  );
}

/**
 * Contents that unfold and fold by height and opacity. `id` keys the presence,
 * so a different node's children replace these by folding rather than by being
 * swapped in place.
 */
export function Unfold({ open, id, children }: { open: boolean; id: string; children: ReactNode }): JSX.Element {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key={id}
          layout="position"
          className="overflow-hidden"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
        >
          <PresenceScope>{children}</PresenceScope>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * A box whose height follows its contents smoothly. Rows inside glide by FLIP,
 * but FLIP moves only what carries a layoutId: when the tree grows or shrinks,
 * everything BELOW it in the sidebar would jump by the difference. Measuring
 * the contents and animating this box's height to match carries them along.
 */
export function AutoHeight({ children }: { children: ReactNode }): JSX.Element {
  const allowed: boolean = useMotionAllowed();
  return allowed ? <MeasuredHeight>{children}</MeasuredHeight> : <div className="relative">{children}</div>;
}

/** Without motion the box is simply its contents' height; measuring would only make it a frame late. */
function MeasuredHeight({ children }: { children: ReactNode }): JSX.Element {
  const inner: RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');
  useLayoutEffect((): (() => void) | void => {
    const el: HTMLDivElement | null = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer: ResizeObserver = new ResizeObserver((): void => setHeight(el.offsetHeight));
    observer.observe(el);
    setHeight(el.offsetHeight);
    return (): void => observer.disconnect();
  }, []);
  return (
    <motion.div className="overflow-hidden" initial={false} animate={{ height }}>
      {/* Positioned: what popLayout lifts out of the flow is placed against this. */}
      <div ref={inner} className="relative">{children}</div>
    </motion.div>
  );
}

export { AnimatePresence };
