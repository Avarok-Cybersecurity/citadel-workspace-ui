/**
 * The styles gallery offers what a blank document carries: the generated sheet must be the
 * vendored pair's own `blank_model_json()` styles, so re-vendoring without regenerating fails.
 */
import { describe, expect, it } from 'vitest';
import { BUILTIN_STYLE_SHEET } from '../generated/builtin-styles';
import { paragraphStyles, resolvedRun, styleDisplayName, type StyleDefinition } from '../editor/style-sheet';
import * as glue from '../../../../vendor/cdoc/cdoc_wasm.js';
import { realWasm } from './wasm-rig';

describe('the built-in style sheet', () => {
  it('is exactly the vendored engine’s blank-document sheet', () => {
    realWasm();
    const model: { styles: unknown } = JSON.parse(glue.blank_model_json()) as { styles: unknown };
    expect(BUILTIN_STYLE_SHEET).toEqual(model.styles);
  });

  it('resolves a heading over Normal and the document defaults', () => {
    expect(resolvedRun(BUILTIN_STYLE_SHEET, 'Heading1')).toEqual({ font: 'Calibri Light', size: 32, color: '#2F5496' });
    expect(resolvedRun(BUILTIN_STYLE_SHEET, 'Normal')).toEqual({ font: 'Calibri', size: 22 });
  });

  it('refuses a style the sheet does not have rather than previewing a guess', () => {
    expect(() => resolvedRun(BUILTIN_STYLE_SHEET, 'NoSuchStyle')).toThrow(/no style NoSuchStyle/);
  });

  it('offers only paragraph styles, named as Word names them', () => {
    const names: string[] = paragraphStyles(BUILTIN_STYLE_SHEET).map((s: StyleDefinition): string => styleDisplayName(s));
    expect(names).toContain('Heading 1');
    expect(names).not.toContain('Hyperlink');
  });
});
