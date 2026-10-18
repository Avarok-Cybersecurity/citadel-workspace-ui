/**
 * cdoc-model's `StyleSheet` in its JSON shape, and how a style's look is resolved: the
 * document defaults, then each `basedOn` ancestor, then the style itself, a later set field
 * winning, exactly as `RunProperties::overlay` layers them.
 */
import type { ParagraphPropertiesPatch, RunPropertiesPatch } from './model-values';

export type StyleKind = 'paragraph' | 'character' | 'table';

export interface StyleDefinition {
  readonly id: string;
  /** The stored name (Word's built-ins are lower case: "heading 1"). */
  readonly name: string;
  readonly kind: StyleKind;
  readonly basedOn?: string;
  readonly next?: string;
  readonly paragraph: ParagraphPropertiesPatch;
  readonly run: RunPropertiesPatch;
}

export interface StyleSheet {
  readonly defaults: { readonly run: RunPropertiesPatch; readonly paragraph: ParagraphPropertiesPatch };
  readonly styles: readonly StyleDefinition[];
}

/** The style's run properties with every ancestor and the document defaults beneath them. */
export function resolvedRun(sheet: StyleSheet, styleId: string): RunPropertiesPatch {
  const chain: StyleDefinition[] = [];
  const seen: Set<string> = new Set<string>();
  let id: string | undefined = styleId;
  while (id !== undefined && !seen.has(id)) {
    seen.add(id);
    const current: StyleDefinition | undefined = sheet.styles.find((s: StyleDefinition): boolean => s.id === id);
    if (current === undefined) throw new Error(`the style sheet has no style ${id}`);
    chain.unshift(current);
    id = current.basedOn;
  }
  return chain.reduce((run: RunPropertiesPatch, s: StyleDefinition): RunPropertiesPatch => ({ ...run, ...s.run }), sheet.defaults.run);
}

/** The paragraph styles, in the sheet's order: what a styles gallery offers. */
export function paragraphStyles(sheet: StyleSheet): readonly StyleDefinition[] {
  return sheet.styles.filter((s: StyleDefinition): boolean => s.kind === 'paragraph');
}

/** Word shows a built-in's stored name capitalised ("heading 1" is "Heading 1"). */
export function styleDisplayName(style: StyleDefinition): string {
  return style.name.charAt(0).toUpperCase() + style.name.slice(1);
}
