/**
 * Home › Paragraph › Bullets and Numbering: Word's built-in list templates (SetNumberingKind)
 * at the caret paragraph's list level, or the first level outside a list; None ends the list.
 * The editor reports that a paragraph is in a list but not which kind, so neither control
 * shows a current kind; No list ends the list whatever its kind. Moving between levels is
 * Increase and Decrease indent.
 */
import { List, ListOrdered, ListX } from 'lucide-react';
import type { ListKind } from '@/lib/cdoc/editor/controller';
import { caretParagraph } from './formatting';
import { RibbonButton } from './RibbonButton';
import { MenuOption, RibbonMenu } from './RibbonMenu';
import { useRibbon, type Ribbon } from './ribbon-context';

interface NumberingChoice {
  readonly kind: ListKind;
  readonly label: string;
  readonly sample: string;
}

const NUMBERING: readonly NumberingChoice[] = [
  { kind: 'decimal', label: 'Numbers', sample: '1. 2. 3.' },
  { kind: 'lowerLetter', label: 'Lower-case letters', sample: 'a. b. c.' },
  { kind: 'upperLetter', label: 'Capital letters', sample: 'A. B. C.' },
  { kind: 'lowerRoman', label: 'Lower-case Roman', sample: 'i. ii. iii.' },
  { kind: 'upperRoman', label: 'Capital Roman', sample: 'I. II. III.' },
];

/** The first of a list's nine levels. */
const FIRST_LEVEL: number = 0;

export function ListControls(): JSX.Element {
  const { caret, run }: Ribbon = useRibbon();
  const numbering: { readonly numId: number; readonly level: number } | null = caretParagraph(caret, 'numbering');
  const level: number = numbering?.level ?? FIRST_LEVEL;
  // Only a paragraph the editor reports as outside a list has none to end.
  const noList: string | null = caret.known && !caret.paragraphMixed.has('numbering') && numbering === null ? 'This paragraph is not in a list.' : null;
  const endList = (): void => { void run({ name: 'clearNumbering' }, 'end the list'); };
  const list = (kind: ListKind, what: string): void => { void run({ name: 'setNumberingKind', kind, level }, what); };
  return (
    <>
      <RibbonButton testId="ribbon-bullets" label="Bullets" icon={List} onPress={(): void => list('bullet', 'make a bulleted list')} />
      <RibbonButton testId="ribbon-list-none" label="No list" icon={ListX} unavailable={noList} onPress={endList} />
      <RibbonMenu testId="ribbon-numbering" label="Numbering" icon={ListOrdered} text="Numbering" widthPx={220}>
        {(close: () => void): JSX.Element[] => [
          ...NUMBERING.map((n: NumberingChoice): JSX.Element => (
            <MenuOption key={n.kind} testId={`ribbon-numbering-${n.kind}`} label={n.label} detail={n.sample}
              onChoose={(): void => { close(); list(n.kind, `number the list with ${n.label.toLowerCase()}`); }} />
          )),
          <MenuOption key="none" testId="ribbon-numbering-none" label="None" detail="End the list here"
            onChoose={(): void => { close(); endList(); }} />,
        ]}
      </RibbonMenu>
    </>
  );
}
