/**
 * Home › Styles: the document's paragraph styles, each previewed in its own resolved look
 * (face, size, weight, slant, colour) on the page's paper, applied with SetParagraphStyle.
 * The sheet is the blank document's built-in one (generated from the engine); the button
 * names the caret's style once the engine reports it.
 */
import { Pilcrow } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { RunPropertiesPatch } from '@/lib/cdoc/editor/model-values';
import { paragraphStyles, resolvedRun, styleDisplayName, type StyleDefinition, type StyleSheet } from '@/lib/cdoc/editor/style-sheet';
import { FONT_MANIFEST } from '@/lib/cdoc/generated/font-manifest';
import { BUILTIN_STYLE_SHEET } from '@/lib/cdoc/generated/builtin-styles';
import { RASTERIZER_OPTIONS } from '@/lib/cdoc/paint/paint-config';
import { cn } from '@/lib/utils';
import { cssFontFamily } from './CdocFontFaces';
import { caretParagraph } from './formatting';
import { RIBBON_CONTROL } from './RibbonButton';
import { RibbonMenu } from './RibbonMenu';
import { RibbonGroup } from './RibbonToolbar';
import { useRibbon, type Ribbon } from './ribbon-context';

/** Previews are capped so Title does not dwarf the list; the relative sizes still read. */
const MAX_PREVIEW_PX: number = 22;
/** Word's automatic text colour on white paper. */
const AUTO_INK: string = '#000000';
/** Half-points to CSS px at 96 dpi: one point is 4/3 px. */
const PX_PER_HALF_POINT: number = 2 / 3;

export function previewStyle(run: RunPropertiesPatch): CSSProperties {
  return {
    fontFamily: run.font === undefined ? undefined : cssFontFamily(run.font, FONT_MANIFEST),
    fontSize: run.size === undefined ? undefined : `${Math.min(run.size * PX_PER_HALF_POINT, MAX_PREVIEW_PX)}px`,
    fontWeight: run.bold === true ? 700 : 400,
    fontStyle: run.italic === true ? 'italic' : 'normal',
    color: run.color ?? AUTO_INK,
  };
}

function StyleOption({ sheet, style, current, onChoose }: { sheet: StyleSheet; style: StyleDefinition; current: boolean | 'mixed'; onChoose: () => void }): JSX.Element {
  const { disabledReason }: Ribbon = useRibbon();
  return (
    <button
      type="button"
      data-roving-item=""
      data-testid={`ribbon-style-${style.id}`}
      aria-pressed={current}
      aria-disabled={disabledReason !== null}
      onClick={(): void => { if (disabledReason === null) onChoose(); }}
      // Paper, not the theme: a style previews as it prints, in light and dark alike.
      className={cn(RIBBON_CONTROL, 'w-full justify-start border border-border px-3 text-left hover:ring-2 hover:ring-ring aria-[pressed=true]:ring-2 aria-[pressed=true]:ring-primary')}
      style={{ backgroundColor: RASTERIZER_OPTIONS.paper }}
    >
      <span className="truncate" style={previewStyle(resolvedRun(sheet, style.id))}>{styleDisplayName(style)}</span>
    </button>
  );
}

export function StylesGallery({ sheet }: { sheet: StyleSheet }): JSX.Element {
  const { caret, run }: Ribbon = useRibbon();
  const currentId: string | null = caretParagraph(caret, 'style');
  const current: StyleDefinition | undefined = sheet.styles.find((s: StyleDefinition): boolean => s.id === currentId);
  return (
    <RibbonMenu testId="ribbon-styles" label="Styles" icon={Pilcrow} text={current === undefined ? 'Styles' : styleDisplayName(current)} widthPx={260}>
      {(close: () => void): JSX.Element[] => paragraphStyles(sheet).map((style: StyleDefinition): JSX.Element => (
        <StyleOption key={style.id} sheet={sheet} style={style} current={currentId === null ? 'mixed' : style.id === currentId}
          onChoose={(): void => { close(); void run({ name: 'setParagraphStyle', style: style.id }, `apply the ${styleDisplayName(style)} style`); }} />
      ))}
    </RibbonMenu>
  );
}

export function StylesGroup(): JSX.Element {
  return (
    <RibbonGroup label="Styles" testId="ribbon-styles-group" collapses={false} icon={Pilcrow}>
      <StylesGallery sheet={BUILTIN_STYLE_SHEET} />
    </RibbonGroup>
  );
}
