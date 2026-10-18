/**
 * The model values some editor commands carry (`value` in citadel-docs docs/edit-commands.md):
 * the JSON shape of cdoc-model's `RunProperties`, `ParagraphProperties` and `Comment`, which
 * the encoder writes in the cdoc_crdt codec, never as JSON text. Every field is optional in a
 * patch: a set field applies, an absent one is kept. Units are the model's own integers.
 */

/** An opaque sRGB colour, `#RRGGBB`. */
export type HexColor = `#${string}`;

/** Hundredths of a point (7200 = one inch); an integer that fits an i32. */
export type Pt100 = number;

export type UnderlineStyle = 'none' | 'single' | 'double' | 'thick' | 'dotted' | 'dashed' | 'wave' | 'words';
export type VerticalAlign = 'baseline' | 'superscript' | 'subscript';

export interface RunPropertiesPatch {
  readonly style?: string;
  readonly font?: string;
  /** Half-points: 24 is 12 pt. */
  readonly size?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: { readonly style: UnderlineStyle; readonly color?: HexColor };
  readonly strike?: boolean;
  readonly verticalAlign?: VerticalAlign;
  readonly color?: HexColor;
  readonly highlight?: HexColor;
  readonly smallCaps?: boolean;
  readonly allCaps?: boolean;
}

export type Alignment = 'left' | 'center' | 'right' | 'justify';

export type LineSpacing =
  /** 240ths of a line: 240 single, 276 is 1.15, 360 is 1.5, 480 double. */
  | { readonly rule: 'multiple'; readonly lines: number }
  | { readonly rule: 'exact'; readonly height: Pt100 }
  | { readonly rule: 'atLeast'; readonly height: Pt100 };

export type FirstLine = { readonly kind: 'indent'; readonly by: Pt100 } | { readonly kind: 'hanging'; readonly by: Pt100 };

/**
 * `ParagraphProperties` less `borders` and `shading`, which no command surface sets yet; add
 * them here, in the model's shape, when one does.
 */
export interface ParagraphPropertiesPatch {
  readonly style?: string;
  readonly alignment?: Alignment;
  readonly spacing?: { readonly before?: Pt100; readonly after?: Pt100; readonly line?: LineSpacing };
  readonly indent?: { readonly left?: Pt100; readonly right?: Pt100; readonly firstLine?: FirstLine };
  readonly keepWithNext?: boolean;
  readonly keepLines?: boolean;
  readonly pageBreakBefore?: boolean;
  readonly numbering?: { readonly numId: number; readonly level: number };
  readonly outlineLevel?: number;
}

/** A comment or reply; `date` is RFC 3339, `parent` names the comment replied to. */
export interface CommentValue {
  readonly id: string;
  readonly author: string;
  readonly date: string;
  readonly text: string;
  readonly resolved: boolean;
  readonly parent?: string;
}
