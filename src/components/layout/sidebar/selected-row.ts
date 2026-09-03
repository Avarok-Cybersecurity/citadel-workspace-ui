/**
 * How the sidebar shows which row you are on.
 *
 * The whole sidebar -- tree nodes, peer conversations, group conversations --
 * marked the current row with `bg-primary-accent/20` and nothing else.
 * Composited over the sidebar's own background that tint measures **1.37:1**,
 * where WCAG 1.4.11 asks for 3:1 of any state a control uses to convey
 * information. The state was really being carried by the text colour changing,
 * which is 2.86:1 against the idle text -- a difference, but a difference made
 * of colour alone.
 *
 * The left rule is what carries it now: full-strength accent against the
 * sidebar, and a position and a shape rather than only a hue. The tint stays as
 * a secondary cue for anyone who reads it.
 *
 * Idle rows reserve the same two pixels in `transparent`, so selecting a row
 * does not nudge every label in the list sideways.
 *
 * One function, in one place, because three components render this state and a
 * fourth will; three copies of it is how the tree came to say one thing and the
 * conversation list another.
 *
 * A function rather than two class strings to concatenate. The first attempt
 * put `border-transparent` in a base string and `border-primary-accent` in the
 * selected one, which lands both in the same `class` attribute -- and which
 * wins is then decided by their order in the stylesheet, not by the order they
 * were written. Measured: the rule came out at 1:1 against the sidebar, exactly
 * as invisible as the tint it was meant to replace. Two mutually exclusive
 * classes need no override and cannot be reordered into each other.
 */

/** The classes for a sidebar row, given whether it is the one on screen. */
export function rowClass(isSelected: boolean): string {
  return [
    // The width is on every row, so selecting one does not nudge the list.
    'border-l-2 transition-colors',
    'hover:bg-primary-accent/15 hover:text-foreground',
    isSelected
      ? 'border-l-primary-accent bg-primary-accent/20 text-primary-accent'
      : 'border-l-transparent text-foreground',
  ].join(' ');
}
