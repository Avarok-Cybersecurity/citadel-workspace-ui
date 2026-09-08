import { CitadelMark } from './CitadelMark';

/**
 * The Citadel Workspace lockups: mark alone, mark + "Citadel", or mark +
 * "Citadel" + "Workspace".
 *
 * The wordmark is live HTML text, not a path and not an image, which is what
 * the brand guidelines intend: "the SVG masters carry live text, not outlines
 * — they render with real SF Pro on Apple platforms and with the nearest
 * available grotesque elsewhere". `tailwind.config.ts` already sets that exact
 * stack as `font-sans`, so the lockup inherits it for free, stays selectable,
 * and scales without a second raster.
 *
 * Sizes are the guidelines' legibility floors, not preferences:
 *
 *   full         240px wide  — the default wherever the tagline can be read
 *   horizontal   130px wide  — top bars and tight headers
 *   mark          20px       — every square context
 */

/** Type sizes as a fraction of the mark's height, taken off the SVG masters. */
const CITADEL_SIZE: number = 0.62;

/**
 * "Workspace" sits at 42% of the wordmark's size, per the guidelines, with
 * +12% tracking against "Citadel"'s -2%.
 */
const WORKSPACE_SIZE: number = CITADEL_SIZE * 0.42;

export type CitadelLogoVariant = 'mark' | 'horizontal' | 'full';

export interface CitadelLogoProps {
  readonly variant: CitadelLogoVariant;
  /** Height of the mark in CSS pixels; the wordmark is sized from it. */
  readonly height: number;
  readonly className?: string;
}

export function CitadelLogo({ variant, height, className }: CitadelLogoProps): JSX.Element {
  // The mark is decorative in the lockups that spell the name beside it —
  // labelling both would make a screen reader say "Citadel Workspace" twice.
  const markLabel: string | null = variant === 'mark' ? 'Citadel Workspace' : null;

  if (variant === 'mark') {
    return <CitadelMark size={height} label={markLabel} className={className} />;
  }

  return (
    <span className={`inline-flex items-center gap-[0.38em] ${className ?? ''}`.trim()}>
      <CitadelMark size={height} label={markLabel} />
      <span className="flex flex-col justify-center leading-none">
        <span
          className="font-sans font-medium"
          style={{
            fontSize: `${height * CITADEL_SIZE}px`,
            letterSpacing: '-0.02em',
            color: 'var(--citadel-wordmark)',
          }}
        >
          Citadel
        </span>
        {variant === 'full' && (
          <span
            className="font-sans font-normal"
            style={{
              fontSize: `${height * WORKSPACE_SIZE}px`,
              letterSpacing: '0.12em',
              color: 'var(--citadel-tagline)',
              marginTop: `${height * 0.06}px`,
            }}
          >
            Workspace
          </span>
        )}
      </span>
    </span>
  );
}
