/**
 * The scroll behaviour to request, honouring prefers-reduced-motion.
 *
 * An explicit `behavior` in ScrollIntoViewOptions beats the
 * `scroll-behavior: auto !important` that index.css sets under
 * prefers-reduced-motion, so the media query has to be read by whoever scrolls.
 */
export function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/**
 * How long script-driven transitions take, in seconds -- the one place they are
 * set. `layout` moves a row to its new place (the focused sidebar's FLIP);
 * `fade` cross-fades and unfolds. Short enough that a click never waits on it.
 */
export const MOTION_SECONDS: { readonly layout: number; readonly fade: number } = { layout: 0.22, fade: 0.16 };
