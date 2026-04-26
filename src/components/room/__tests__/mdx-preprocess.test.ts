import { describe, it, expect } from 'vitest';
import { applyGfmStrikethrough, transformOutsideCode } from '../mdx-preprocess';

describe('applyGfmStrikethrough', () => {
  it('transforms a basic ~~strikethrough~~', () => {
    expect(applyGfmStrikethrough('hello ~~world~~')).toBe('hello <del>world</del>');
  });

  it('transforms multiple occurrences in the same paragraph', () => {
    expect(applyGfmStrikethrough('~~a~~ and ~~b~~')).toBe(
      '<del>a</del> and <del>b</del>',
    );
  });

  it('does NOT touch ~~text~~ inside an inline code span', () => {
    // The literal backtick-delimited segment must come through unchanged.
    const input = 'try `~~not strikethrough~~` here';
    expect(applyGfmStrikethrough(input)).toBe(input);
  });

  it('does NOT touch ~~text~~ inside a fenced code block', () => {
    const input = [
      'text before',
      '```',
      'console.log(~~"keep me literal"~~);',
      '```',
      'text after with ~~real~~ strikethrough',
    ].join('\n');
    const out = applyGfmStrikethrough(input);
    // Fenced block content is preserved verbatim
    expect(out).toContain('console.log(~~"keep me literal"~~);');
    // Strikethrough outside the block IS applied
    expect(out).toContain('<del>real</del>');
  });

  it('handles fenced blocks with a language tag', () => {
    const input = '```ts\nconst x = ~~y~~;\n```\n~~outside~~';
    const out = applyGfmStrikethrough(input);
    expect(out).toContain('const x = ~~y~~;');
    expect(out).toContain('<del>outside</del>');
  });

  it('does not transform stray double-tildes (require non-space immediately inside)', () => {
    // The (?=\S)...\S anchors require non-whitespace at both ends.
    expect(applyGfmStrikethrough('~~ not strike ~~')).toBe('~~ not strike ~~');
    expect(applyGfmStrikethrough('~~~~')).toBe('~~~~');
  });

  it('is idempotent on text that contains no ~~ markers', () => {
    const plain = 'no markers here, just text and `code` and\n```\nmore code\n```';
    expect(applyGfmStrikethrough(plain)).toBe(plain);
  });

  it('handles unbalanced backticks gracefully (no infinite loop, no exception)', () => {
    // A lone backtick should not start an inline code span (the regex
    // requires `[^`\n]*\``). Strikethrough outside should still apply.
    const input = 'unbalanced ` here ~~strike~~ end';
    const out = applyGfmStrikethrough(input);
    expect(out).toContain('<del>strike</del>');
  });
});

describe('transformOutsideCode', () => {
  it('passes a non-code-only string through `transform` once', () => {
    let count = 0;
    const out = transformOutsideCode('plain text', (s) => {
      count++;
      return s.toUpperCase();
    });
    expect(out).toBe('PLAIN TEXT');
    expect(count).toBe(1);
  });

  it('preserves code regions verbatim and runs transform on each gap', () => {
    const out = transformOutsideCode('a `b` c ```d``` e', (s) =>
      s.replace(/[a-z]/g, (ch) => ch.toUpperCase()),
    );
    expect(out).toBe('A `b` C ```d``` E');
  });

  it('returns empty string for empty input', () => {
    expect(transformOutsideCode('', (s) => `[${s}]`)).toBe('[]');
  });
});
