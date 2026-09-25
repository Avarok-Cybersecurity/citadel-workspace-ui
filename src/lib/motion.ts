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
