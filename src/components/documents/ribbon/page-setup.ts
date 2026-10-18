/**
 * Layout › Page Setup's choices, each one SetSectionProperty patch: Word's margin presets, its
 * common paper sizes, the two orientations and one to three columns. Pt100 throughout
 * (7200 = one inch). A size is sent portrait, as PageSetupPatch replaces `size` whole.
 */
import type { PageSetupPatch, Pt100 } from '@/lib/cdoc/editor/model-values';

export interface PageSetupChoice {
  readonly id: string;
  readonly label: string;
  /** What the choice sets, shown under its name. */
  readonly detail: string;
  readonly patch: PageSetupPatch;
}

const INCH: Pt100 = 7200;
/** Word's header and footer distance, half an inch, in every preset. */
const HEADER_FOOTER: Pt100 = INCH / 2;
/** Word's default gap between columns. */
const COLUMN_GAP: Pt100 = INCH / 2;

function margins(id: string, label: string, topBottom: Pt100, leftRight: Pt100, detail: string): PageSetupChoice {
  return {
    id, label, detail,
    patch: { margins: { top: topBottom, bottom: topBottom, left: leftRight, right: leftRight, header: HEADER_FOOTER, footer: HEADER_FOOTER, gutter: 0 } },
  };
}

export const MARGIN_CHOICES: readonly PageSetupChoice[] = [
  margins('normal', 'Normal', INCH, INCH, '1 in all round'),
  margins('narrow', 'Narrow', INCH / 2, INCH / 2, '0.5 in all round'),
  margins('moderate', 'Moderate', INCH, INCH * 0.75, '1 in top and bottom, 0.75 in sides'),
  margins('wide', 'Wide', INCH, INCH * 2, '1 in top and bottom, 2 in sides'),
];

function paper(id: string, label: string, width: Pt100, height: Pt100, detail: string): PageSetupChoice {
  return { id, label, detail: `${detail}, portrait`, patch: { size: { width, height, orientation: 'portrait' } } };
}

export const SIZE_CHOICES: readonly PageSetupChoice[] = [
  paper('letter', 'Letter', 61200, 79200, '8.5 × 11 in'),
  paper('legal', 'Legal', 61200, 100800, '8.5 × 14 in'),
  paper('a4', 'A4', 59528, 84189, '210 × 297 mm'),
  paper('a5', 'A5', 41953, 59528, '148 × 210 mm'),
];

export const ORIENTATION_CHOICES: readonly PageSetupChoice[] = [
  { id: 'portrait', label: 'Portrait', detail: 'Taller than wide', patch: { orientation: 'portrait' } },
  { id: 'landscape', label: 'Landscape', detail: 'Wider than tall', patch: { orientation: 'landscape' } },
];

export const COLUMN_CHOICES: readonly PageSetupChoice[] = [1, 2, 3].map((count: number): PageSetupChoice => ({
  id: String(count),
  label: count === 1 ? 'One' : count === 2 ? 'Two' : 'Three',
  detail: count === 1 ? 'One column' : `${count} columns, 0.5 in apart`,
  patch: { columns: { count, gap: COLUMN_GAP, separator: false } },
}));
