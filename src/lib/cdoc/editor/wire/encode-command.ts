/**
 * EditorCommand -> request record (docs/edit-commands.md v4): the opcode from COMMAND_OPCODES,
 * then the command's fields in the spec's order. Enumerations are written as their index in
 * the spec's table, the same tables cdoc-edit's decoder reads.
 */
import { COMMAND_OPCODES, type BreakKind, type CaretGranularity, type DeleteUnit, type EditorCommand, type ListKind, type Mark } from '../controller';
import { RecordWriter } from './record-writer';

const UNITS: readonly DeleteUnit[] = ['char', 'word'];
const BREAKS: readonly BreakKind[] = ['line', 'page', 'column'];
const MARKS: readonly Mark[] = ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript'];
const GRANULARITIES: readonly CaretGranularity[] = ['char', 'word', 'lineBoundary', 'line', 'paragraph', 'document'];
const LIST_KINDS: readonly ListKind[] = ['bullet', 'decimal', 'lowerLetter', 'upperLetter', 'lowerRoman', 'upperRoman'];

/** The deepest list level, inclusive (cdoc_model::numbering::MAX_LEVEL). */
const MAX_LIST_LEVEL: number = 8;

function listLevel(level: number): number {
  if (!Number.isInteger(level) || level < 0 || level > MAX_LIST_LEVEL) throw new Error(`editor record: list level ${level} is not 0..=${MAX_LIST_LEVEL}`);
  return level;
}

function code<T>(table: readonly T[], v: T): number {
  const at: number = table.indexOf(v);
  if (at < 0) throw new Error(`editor record: ${String(v)} is not in its table`);
  return at;
}

function fields(w: RecordWriter, c: EditorCommand): void {
  switch (c.name) {
    case 'insertText': w.str(c.text); return;
    case 'deleteBackward':
    case 'deleteForward': w.u8(code(UNITS, c.unit)); return;
    case 'insertBreak': w.u8(code(BREAKS, c.kind)); return;
    case 'toggleMark': w.u8(code(MARKS, c.mark)); return;
    case 'setRunProperty':
    case 'setParagraphProperty':
    case 'setSectionProperty': w.value(c.patch); return;
    case 'setNumberingKind': w.u8(code(LIST_KINDS, c.kind)).u8(listLevel(c.level)); return;
    case 'insertImageFitted': w.str(c.contentId); return;
    case 'setParagraphStyle': w.str(c.style); return;
    case 'setNumbering': w.uv(c.numId, 'numId').u8(c.level); return;
    case 'insertTable': w.uv(c.rows, 'rows').uv(c.cols, 'cols'); return;
    case 'insertImage': w.str(c.contentId).pt(c.width, 'width').pt(c.height, 'height'); return;
    case 'insertFootnote': w.uv(c.id, 'footnote id'); return;
    case 'insertLink': w.str(c.href); return;
    case 'insertComment': w.value(c.comment); return;
    case 'replace': w.raw(c.from).raw(c.to).str(c.text); return;
    case 'setSelection': w.raw(c.anchor).raw(c.head); return;
    case 'moveCaret': w.u8(code(GRANULARITIES, c.granularity)).bool(c.forward).bool(c.extend); return;
    case 'selectWord':
    case 'selectParagraph': w.raw(c.at); return;
    case 'compositionUpdate': w.str(c.text).uv(c.caret, 'composition caret'); return;
    case 'splitParagraph': case 'insertTab': case 'clearNumbering': case 'indent': case 'outdent':
    case 'insertRowAbove': case 'insertRowBelow': case 'insertColumnLeft': case 'insertColumnRight':
    case 'deleteRow': case 'deleteColumn': case 'deleteTable': case 'mergeCells': case 'removeLink':
    case 'selectAll': case 'undo': case 'redo': case 'breakUndoGroup': case 'insertNewFootnote': case 'cut':
    case 'compositionStart': case 'compositionCommit': case 'compositionCancel':
      return;
  }
  const unknown: never = c;
  throw new Error(`editor record: no encoding for ${JSON.stringify(unknown)}`);
}

export function encodeCommand(command: EditorCommand): Uint8Array {
  const w: RecordWriter = new RecordWriter().u8(COMMAND_OPCODES[command.name]);
  fields(w, command);
  return w.finish();
}
