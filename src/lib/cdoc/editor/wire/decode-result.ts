/**
 * The "CDE" result record, version 4 (docs/edit-commands.md): what every request and remote
 * update returns. Version 2 appended the caret's formatting, version 3 what the request
 * created under ids the editor picked, version 4 the caret's section and the selection's
 * plain text. Only version 4 is read; any other is refused by name.
 */
import type { EditorPosition, PageRect } from '../controller';
import type { KnownFormatting } from '../caret-formatting';
import type { PageSetup } from '../model-values';
import { RecordReader } from './decode-records';
import { map, readFormatting } from './decode-formatting';
import { RecordError } from './record-writer';

export const RESULT_VERSION: number = 4;

/** Something a request made under an id the editor picked (InsertNewFootnote, SetNumberingKind). */
export interface Created {
  readonly kind: 'footnote' | 'numbering';
  readonly id: number;
}

/**
 * The selection's plain text, for Copy and Cut (a copy event sets the clipboard synchronously,
 * so it rides in the result). Past 64 KiB of UTF-8 the record carries none: `complete: false`,
 * and selectionText() fetches it.
 */
export type SelectionText = { readonly complete: true; readonly text: string } | { readonly complete: false };

export interface EditorResult {
  /** The CRDT update to relay; empty when nothing changed (always, for a remote update). */
  readonly update: Uint8Array;
  readonly dirtyPages: readonly number[];
  readonly pageCount: number;
  readonly anchor: EditorPosition;
  readonly head: EditorPosition;
  readonly caret: PageRect | null;
  /** On the viewport's and the repainted pages once a viewport was set (every page before). */
  readonly selectionRects: readonly PageRect[];
  readonly formatting: KnownFormatting;
  readonly created: readonly Created[];
  readonly selectionText: SelectionText;
}

const CREATED_KINDS: readonly Created['kind'][] = ['footnote', 'numbering'];

function created(r: RecordReader): Created[] {
  return Array.from({ length: r.count(2, 'created') }, (): Created => {
    const kind: Created['kind'] | undefined = CREATED_KINDS[r.u8()];
    if (kind === undefined) throw new RecordError('unknown created kind');
    return { kind, id: r.uv() };
  });
}

function selectionText(r: RecordReader): SelectionText {
  const complete: number = r.u8();
  if (complete === 1) return { complete: true, text: r.str() };
  if (complete === 0) return { complete: false };
  throw new RecordError(`selection text flag ${complete}`);
}

export function decodeResult(bytes: Uint8Array): EditorResult {
  const r: RecordReader = new RecordReader(bytes);
  r.magic('CDE', RESULT_VERSION);
  const update: Uint8Array = r.bytesField();
  const dirtyPages: number[] = Array.from({ length: r.count(1, 'the dirty pages') }, (): number => r.uv());
  const pageCount: number = r.uv();
  const anchor: EditorPosition = r.position();
  const head: EditorPosition = r.position();
  const caret: PageRect | null = r.caret();
  const selectionRects: PageRect[] = r.rects();
  const formatting: Omit<KnownFormatting, 'section'> = readFormatting(r);
  const made: Created[] = created(r);
  // The model's PageSetup serde shape; cdoc-edit is its authority.
  const section: PageSetup = map(r.bytesField(), 'section') as unknown as PageSetup;
  const text: SelectionText = selectionText(r);
  r.end();
  return { update, dirtyPages, pageCount, anchor, head, caret, selectionRects, formatting: { ...formatting, section }, created: made, selectionText: text };
}
