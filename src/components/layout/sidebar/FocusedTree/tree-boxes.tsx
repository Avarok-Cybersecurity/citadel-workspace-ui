/**
 * The boxes around the focused tree's rows, shaped so that they never fight the rows' glide (see
 * tree-motion): none of them changes size in the flow while the rows move, except the outermost, which
 * carries what sits below the tree.
 */
import { forwardRef, useLayoutEffect, useRef, useState, type ForwardedRef, type ForwardRefExoticComponent, type ReactNode, type RefAttributes, type RefObject } from 'react';
import { animate, motion, useMotionValue, type MotionValue } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useMotionAllowed } from '@/hooks/use-motion-allowed';
import { FADE_OUT, GLIDE, PresenceScope } from './tree-motion';

/**
 * A box whose height follows its contents smoothly. Everything inside reaches
 * its final layout at once and glides there by FLIP, but FLIP moves only what
 * carries a layout id: when the tree grows or shrinks, everything BELOW it in
 * the sidebar would jump by the difference. Animating this box's height with
 * the glide's timing carries them along.
 */
export function AutoHeight({ children }: { children: ReactNode }): JSX.Element {
  const allowed: boolean = useMotionAllowed();
  return allowed ? <MeasuredHeight>{children}</MeasuredHeight> : <div className="relative">{children}</div>;
}

/**
 * Without motion the box is simply its contents' height; measuring would only make it a frame late. The
 * height is driven straight from the observer, not through a render, which would start it frames after the
 * rows it has to keep pace with.
 */
function MeasuredHeight({ children }: { children: ReactNode }): JSX.Element {
  const inner: RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
  const height: MotionValue<number | string> = useMotionValue<number | string>('auto');
  useLayoutEffect((): (() => void) | void => {
    const el: HTMLDivElement | null = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    height.set(el.offsetHeight);
    const observer: ResizeObserver = new ResizeObserver((): void => { animate(height, el.offsetHeight, GLIDE); });
    observer.observe(el);
    return (): void => observer.disconnect();
  }, [height]);
  return (
    <motion.div className="overflow-hidden" style={{ height }}>
      {/* Positioned: what popLayout lifts out of the flow is placed against this. */}
      <div ref={inner} className="relative">{children}</div>
    </motion.div>
  );
}

/**
 * The ancestor stack's box. It fades out where it stands when the stack goes (popped out of the flow, so
 * the rows below take their places at once and glide there). Its tint and outline are a layer of their own
 * that resizes by FLIP with the rows, and that layer alone fades in when a stack appears: the rows gliding
 * into it are already on screen and must not blink.
 */
export const StackBox: ForwardRefExoticComponent<{ children: ReactNode } & RefAttributes<HTMLLIElement>> = forwardRef<HTMLLIElement, { children: ReactNode }>(
  function StackBox({ children }: { children: ReactNode }, ref: ForwardedRef<HTMLLIElement>): JSX.Element {
    return (
      <motion.li ref={ref} role="none" data-testid="tree-ancestor-stack" className="relative mb-2 border border-transparent p-1" {...FADE_OUT}>
        <motion.div
          aria-hidden="true"
          layout
          className="absolute -inset-px border border-primary-accent/35 bg-primary-accent/10"
          style={{ borderRadius: 7 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
        <PresenceScope>{children}</PresenceScope>
      </motion.li>
    );
  },
);

/**
 * A list that becomes a scroll container only once it is taller than its cap. A scroll container clips,
 * and rows gliding into the list from the stack above would be cut at its edge on the way in.
 */
export function ScrollWhenTall({ children }: { children: ReactNode }): JSX.Element {
  const box: RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState<boolean>(false);
  useLayoutEffect((): (() => void) | void => {
    const el: HTMLDivElement | null = box.current;
    const content: Element | null = el?.firstElementChild ?? null;
    if (!el || !(content instanceof HTMLElement) || typeof ResizeObserver === 'undefined') return;
    const measure = (): void => setScrolls(content.offsetHeight > el.clientHeight + 0.5);
    const observer: ResizeObserver = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(content);
    measure();
    return (): void => observer.disconnect();
  }, []);
  return <motion.div ref={box} layoutScroll className={cn('max-h-[60vh]', scrolls && 'overflow-y-auto')}>{children}</motion.div>;
}
