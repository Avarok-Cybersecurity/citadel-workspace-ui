/**
 * Formatting where the selection starts, from the v2 result record (docs/edit-commands.md):
 * for a collapsed selection what the next typed text gets, for a range its first character's.
 * The ribbons render pressed states from the effective (cascaded) values and the
 * indeterminate state (aria-pressed="mixed") from the mixed sets.
 */
import type { ParagraphProperties, RunPropertiesPatch } from './model-values';

/** Bit order of the run_mixed set: bit i is RUN_KEYS[i]. */
export const RUN_KEYS = [
  'style', 'font', 'size', 'bold', 'italic', 'underline', 'strike', 'verticalAlign', 'color', 'highlight', 'smallCaps', 'allCaps',
] as const;
/** Bit order of the paragraph_mixed set: bit i is PARAGRAPH_KEYS[i]. */
export const PARAGRAPH_KEYS = [
  'style', 'alignment', 'spacing', 'indent', 'borders', 'shading', 'keepWithNext', 'keepLines', 'pageBreakBefore', 'numbering', 'outlineLevel',
] as const;

export type RunKey = (typeof RUN_KEYS)[number];
export type ParagraphKey = (typeof PARAGRAPH_KEYS)[number];

export interface KnownFormatting {
  readonly known: true;
  /** RunProperties after the cascade: what a toggle shows as pressed. */
  readonly run: RunPropertiesPatch;
  /** RunProperties set directly on the run. */
  readonly runDirect: RunPropertiesPatch;
  /** ParagraphProperties after the cascade; `style` is the paragraph style id, `numbering` the list. */
  readonly paragraph: ParagraphProperties;
  readonly paragraphDirect: ParagraphProperties;
  /** Keys whose effective value differs somewhere in the selected text; empty when collapsed. */
  readonly runMixed: ReadonlySet<RunKey>;
  /** Keys whose effective value differs between the selected paragraphs; empty when collapsed. */
  readonly paragraphMixed: ReadonlySet<ParagraphKey>;
}

/**
 * `known: false` only before the first result (a replica just opened reports its selection
 * through awareness, which carries no formatting); ribbons show it as indeterminate.
 */
export type CaretFormatting = { readonly known: false } | KnownFormatting;
