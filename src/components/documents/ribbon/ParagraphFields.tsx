/**
 * Paragraph spacing and indent fields, in points (Pt100 on the wire), shared by Home and
 * Layout. The engine overlays `spacing` and `indent` as whole values, so a patch naming one
 * member clears its siblings; when the caret's paragraph is known its other members are sent
 * with it, and until then only the changed member can be sent.
 */
import type { CaretFormatting } from '@/lib/cdoc/editor/controller';
import type { ParagraphPropertiesPatch, Pt100 } from '@/lib/cdoc/editor/model-values';
import { pointsToPt100, pt100ToPoints } from './formatting';
import { RibbonNumberField } from './RibbonFields';
import { useRibbon, type Ribbon } from './ribbon-context';

type SpacingKey = 'before' | 'after';
type IndentKey = 'left' | 'right';

/** Word's limits for each, in points. */
const SPACING_MAX_PT: number = 1584;
const INDENT_MAX_PT: number = 1584;
const INDENT_MIN_PT: number = -1584;

/**
 * While the caret's paragraph is not known, a member cannot be sent without clearing its
 * siblings (the engine overlays these values whole), so the fields wait for the caret.
 */
export const SIBLINGS_UNKNOWN: string = 'Setting one spacing or indent would reset the others until the paragraph’s formatting is shown.';

type Spacing = NonNullable<ParagraphPropertiesPatch['spacing']>;

export function spacingPatch(caret: CaretFormatting, change: Spacing): ParagraphPropertiesPatch {
  const current: Spacing | undefined = caret.known ? caret.paragraph.spacing : undefined;
  return { spacing: { ...current, ...change } };
}

type Indent = NonNullable<ParagraphPropertiesPatch['indent']>;

export function indentPatch(caret: CaretFormatting, change: Indent): ParagraphPropertiesPatch {
  const current: Indent | undefined = caret.known ? caret.paragraph.indent : undefined;
  return { indent: { ...current, ...change } };
}

function caretPoints(value: Pt100 | undefined, known: boolean): number | null {
  return known && value !== undefined ? pt100ToPoints(value) : null;
}

const SPACING_LABELS: Readonly<Record<SpacingKey, string>> = { before: 'Before', after: 'After' };
const INDENT_LABELS: Readonly<Record<IndentKey, string>> = { left: 'Left', right: 'Right' };

export function SpacingFields({ idPrefix }: { idPrefix: string }): JSX.Element {
  const { caret, run }: Ribbon = useRibbon();
  return (
    <>
      {(['before', 'after'] as const).map((key: SpacingKey): JSX.Element => (
        <RibbonNumberField key={key} testId={`${idPrefix}-spacing-${key}`} label={`Spacing ${SPACING_LABELS[key].toLowerCase()}`} shortLabel={SPACING_LABELS[key]} unit="pt" min={0} max={SPACING_MAX_PT} unavailable={caret.known ? null : SIBLINGS_UNKNOWN}
          value={caretPoints(caret.known ? caret.paragraph.spacing?.[key] : undefined, caret.known)}
          onCommit={(points: number): void => { void run({ name: 'setParagraphProperty', patch: spacingPatch(caret, { [key]: pointsToPt100(points) }) }, `change the spacing ${key}`); }} />
      ))}
    </>
  );
}

export function IndentFields({ idPrefix }: { idPrefix: string }): JSX.Element {
  const { caret, run }: Ribbon = useRibbon();
  return (
    <>
      {(['left', 'right'] as const).map((key: IndentKey): JSX.Element => (
        <RibbonNumberField key={key} testId={`${idPrefix}-indent-${key}`} label={`Indent ${INDENT_LABELS[key].toLowerCase()}`} shortLabel={INDENT_LABELS[key]} unit="pt" min={INDENT_MIN_PT} max={INDENT_MAX_PT} unavailable={caret.known ? null : SIBLINGS_UNKNOWN}
          value={caretPoints(caret.known ? caret.paragraph.indent?.[key] : undefined, caret.known)}
          onCommit={(points: number): void => { void run({ name: 'setParagraphProperty', patch: indentPatch(caret, { [key]: pointsToPt100(points) }) }, `change the ${key} indent`); }} />
      ))}
    </>
  );
}
