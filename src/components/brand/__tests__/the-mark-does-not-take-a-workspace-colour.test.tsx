/**
 * The logo is fixed; the workspace palette is not.
 *
 * A workspace administrator picks any of nine presets and can override the
 * whole palette at runtime. If the mark drew itself with `--primary` or
 * `--primary-accent` it would be repainted per workspace — the brand
 * guidelines forbid exactly that: "Don't recolour the arrow to a theme colour.
 * The logo is fixed; the workspace palette is not."
 *
 * The mechanism is that the mark reads `--citadel-*`, which live in
 * `styles/brand-tokens.css` and are not part of the theme system. This asserts
 * the mechanism rather than a rendered colour, because a rendered colour in
 * jsdom would only prove that today's default theme happens to agree.
 *
 * The second half is the ground flip. #6E59A5 clears 5.8:1 on white but only
 * 2.9:1 on the dark ground, and #9B87F5 is the inverse — under the 3:1 floor
 * for a graphical object. So the two cuts are different values, and neither is
 * a recolour of the other.
 */
import { describe, it, expect } from 'vitest';
import { render, type RenderResult } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CitadelMark } from '../CitadelMark';

const TOKENS: string = readFileSync(
  join(process.cwd(), 'src', 'styles', 'brand-tokens.css'),
  'utf8',
);

describe('the Citadel mark', () => {
  it('draws itself from the brand variables, never the theme palette', () => {
    const { container } = render(<CitadelMark size={64} label="Citadel Workspace" />);
    const strokes: string[] = Array.from(container.querySelectorAll('path')).map(
      (p: Element): string => p.getAttribute('stroke') ?? '',
    );

    expect(strokes).toHaveLength(3);
    expect(strokes[0]).toBe('var(--citadel-ink)');
    expect(strokes[1]).toBe('var(--citadel-arrow)');
    expect(strokes[2]).toBe('var(--citadel-arrow)');

    // The discriminating half: naming a theme token here is the defect, and a
    // test that only checked the positive would pass against `var(--primary)`
    // being added as a fourth path or swapped into one of these.
    const markup: string = container.innerHTML;
    expect(markup).not.toContain('--primary');
    expect(markup).not.toContain('--accent');
  });

  it('carries both ground cuts, as different values rather than a tint', () => {
    // Light ground: dark ink, the darker purple.
    expect(TOKENS).toMatch(/--citadel-ink:\s*#1c1d28/i);
    expect(TOKENS).toMatch(/--citadel-arrow:\s*#6e59a5/i);
    // Dark ground: white ink, the lighter purple.
    expect(TOKENS).toMatch(/--citadel-ink:\s*#ffffff/i);
    expect(TOKENS).toMatch(/--citadel-arrow:\s*#9b87f5/i);
    // And they are genuinely two values. If someone "simplifies" the file down
    // to one purple, the flip is gone and one ground drops to 2.9:1.
    expect(TOKENS).not.toMatch(/--citadel-arrow:\s*var\(/);
  });

  it('uses the compact cut below the production stroke floor', () => {
    // "Below 48 px the production stroke renders as a smear, which is what
    // mark-compact exists for" — stroke 92 against 62.
    const small: RenderResult = render(<CitadelMark size={24} label={null} />);
    const large: RenderResult = render(<CitadelMark size={96} label={null} />);

    expect(small.container.querySelector('g')?.getAttribute('stroke-width')).toBe('92');
    expect(large.container.querySelector('g')?.getAttribute('stroke-width')).toBe('62');
  });

  it('is hidden from assistive technology when it is decorative', () => {
    // A lockup spells the name beside the mark; labelling both makes a screen
    // reader say it twice. An unlabelled role="img" is worse than either.
    const { container } = render(<CitadelMark size={32} label={null} />);
    const svg: Element | null = container.querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
    expect(svg?.getAttribute('aria-label')).toBeNull();
  });
});
