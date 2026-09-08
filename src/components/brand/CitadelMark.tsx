/**
 * The Citadel Workspace mark: a monoline W whose last stroke keeps going and
 * becomes a rising arrow.
 *
 * Drawn rather than loaded. An `<img>` would need two files — the purples flip
 * with the ground and neither is a tint of the other — and would flash the
 * wrong one on a theme change. Inlining lets the colours come from
 * `styles/brand-tokens.css`, so the cut follows the theme in the same paint.
 *
 * The geometry is transcribed from `assets/brand/svg/mark.svg` and is not
 * eyeballed: the barbs sit at ±43° about the shaft, which the guidelines call
 * out specifically ("Narrower than about 40° and the inner barb runs alongside
 * the shaft instead of away from it, and the arrow reads as a hook").
 */

/** Vertices shared by both cuts: left top, valley, apex, valley. */
const W_PATH: string = 'M31 175L200 735L360 275L520 735';

/** The shaft, leaning 16.8° off vertical and overshooting the cap line by 144. */
const SHAFT_PATH: string = 'M520 735L732 31';

/**
 * The production cut. Stroke 62, barbs length 160.
 *
 * `viewBox` is the bare mark box, 834 x 766.
 */
const PRODUCTION = {
  head: 'M594 112L732 31L803 175',
  strokeWidth: 62,
  viewBox: '0 0 834 766',
} as const;

/**
 * The compact cut, for anything rendered below 48px.
 *
 * Stroke 92 against 62 and barbs 180 against 160, so the head stays open at
 * small sizes: "Below 48 px the production stroke renders as a smear, which is
 * what mark-compact exists for". The viewBox grows by 16 a side to give the
 * heavier stroke room.
 */
const COMPACT = {
  head: 'M577 122L732 31L811 193',
  strokeWidth: 92,
  viewBox: '-16 -16 874 814',
} as const;

export interface CitadelMarkProps {
  /**
   * Rendered width in CSS pixels. The height follows the mark box's aspect.
   *
   * Below 48 the compact cut is selected automatically — the guidelines make
   * that a legibility limit rather than a preference, so it is not left to the
   * caller to remember.
   */
  readonly size: number;
  /**
   * A label for assistive technology, or `null` when the mark is decorative
   * because a visible wordmark already names the product beside it.
   *
   * Not optional: an unlabelled `role="img"` is an accessibility failure, and
   * `check-lighthouse.mjs` requires a perfect score. Making the caller choose
   * means the decorative case is a decision rather than an omission.
   */
  readonly label: string | null;
  readonly className?: string;
}

export function CitadelMark({ size, label, className }: CitadelMarkProps): JSX.Element {
  const cut: typeof PRODUCTION | typeof COMPACT = size < 48 ? COMPACT : PRODUCTION;
  const decorative: boolean = label === null;

  return (
    <svg
      viewBox={cut.viewBox}
      width={size}
      height={size * (766 / 834)}
      className={className}
      // Decorative marks are hidden outright rather than given an empty label:
      // a screen reader announcing "image" with no name is worse than silence.
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={label ?? undefined}
      focusable="false"
    >
      {/*
        Colour comes from CSS custom properties on SVG attributes, not Tailwind
        classes. `fill-*`/`stroke-*` utilities would have to resolve to a key in
        tailwind.config.ts (check-color-tokens-exist.mjs), and an arbitrary
        `stroke-[#6E59A5]` is rejected outright by the eslint no-restricted-syntax
        rule against hex literals in class strings. Attributes sidestep both and
        keep the theme flip in CSS where it belongs.
      */}
      <g fill="none" strokeWidth={cut.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d={W_PATH} stroke="var(--citadel-ink)" />
        <path d={SHAFT_PATH} stroke="var(--citadel-arrow)" />
        <path d={cut.head} stroke="var(--citadel-arrow)" />
      </g>
    </svg>
  );
}
