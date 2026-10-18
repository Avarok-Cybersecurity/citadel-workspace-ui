/**
 * The hidden textarea that takes the keyboard for the canvas editor. Keys the keymap knows
 * become commands; text arrives through `beforeinput` (typing, paste, dictation, mobile
 * keyboards) and composition events (IMEs, dead keys) become 0x50-0x53, so the editor sees
 * one path for every way text is entered. A paste is the clipboard's text/plain (R1 has no
 * HTML clipboard), entered as one undo step. The textarea's own value is emptied after each
 * input: the document is the editor's, never the textarea's.
 *
 * An undo step ends on blur and after `pauseMs` without input (BreakUndoGroup), so a pause in
 * typing is a place Undo stops.
 */
import type { EditorCommand, EditorController } from '../controller';
import { commandForKey, type Platform } from './keymap';

export interface ImeBridgeOptions {
  readonly platform: Platform;
  /** Idle time after which the current undo step ends. */
  readonly pauseMs: number;
  /** A command the editor refused (one that does not apply where the selection is). */
  readonly onError: (error: unknown) => void;
}

/** What the bridge needs of a <textarea>. */
export interface TextSink extends EventTarget {
  value: string;
  focus(options?: FocusOptions): void;
}

/** Characters as cdoc-edit counts them: Unicode scalar values, not UTF-16 units. */
const scalarLength = (text: string): number => [...text].length;

export function attachImeBridge(sink: TextSink, editor: EditorController, options: ImeBridgeOptions): () => void {
  let pause: ReturnType<typeof setTimeout> | null = null;
  let composing: boolean = false;

  const run = (command: EditorCommand): void => {
    editor.execute(command).catch(options.onError);
  };
  const breakGroup = (): void => {
    if (pause !== null) clearTimeout(pause);
    pause = null;
    run({ name: 'breakUndoGroup' });
  };
  const typed = (): void => {
    if (pause !== null) clearTimeout(pause);
    pause = setTimeout(breakGroup, options.pauseMs);
  };

  /** Pasted or dropped text: its own undo step, line endings as the document's. */
  const insertBlock = (text: string): void => {
    if (text === '') return;
    breakGroup();
    run({ name: 'insertText', text: text.replace(/\r\n?/g, '\n') });
    breakGroup();
  };

  const onPaste = (event: Event): void => {
    const e: ClipboardEvent = event as ClipboardEvent;
    e.preventDefault();
    insertBlock(e.clipboardData?.getData('text/plain') ?? '');
  };

  const onKeyDown = (event: Event): void => {
    const e: KeyboardEvent = event as KeyboardEvent;
    if (e.isComposing || composing) return;
    const command: EditorCommand | null = commandForKey(e, options.platform);
    if (command === null) return;
    e.preventDefault();
    if (command.name === 'undo' || command.name === 'redo') breakGroup();
    run(command);
    typed();
  };

  const onBeforeInput = (event: Event): void => {
    const e: InputEvent = event as InputEvent;
    if (e.isComposing || composing) return;
    switch (e.inputType) {
      case 'insertText':
      case 'insertReplacementText': {
        e.preventDefault();
        if (e.data !== null && e.data !== '') run({ name: 'insertText', text: e.data });
        typed();
        return;
      }
      case 'insertFromPaste':
      case 'insertFromDrop': {
        e.preventDefault();
        insertBlock(e.dataTransfer?.getData('text/plain') ?? e.data ?? '');
        return;
      }
      case 'insertParagraph': e.preventDefault(); run({ name: 'splitParagraph' }); return;
      case 'insertLineBreak': e.preventDefault(); run({ name: 'insertBreak', kind: 'line' }); return;
      case 'deleteContentBackward': e.preventDefault(); run({ name: 'deleteBackward', unit: 'char' }); return;
      case 'deleteContentForward': e.preventDefault(); run({ name: 'deleteForward', unit: 'char' }); return;
      case 'deleteWordBackward': e.preventDefault(); run({ name: 'deleteBackward', unit: 'word' }); return;
      case 'deleteWordForward': e.preventDefault(); run({ name: 'deleteForward', unit: 'word' }); return;
      default:
        // Formatting and history input types (historyUndo, formatBold, ...) arrive as keys.
        e.preventDefault();
    }
  };

  const onCompositionStart = (): void => {
    composing = true;
    run({ name: 'compositionStart' });
  };
  const onCompositionUpdate = (event: Event): void => {
    const text: string = (event as CompositionEvent).data;
    run({ name: 'compositionUpdate', text, caret: scalarLength(text) });
  };
  const onCompositionEnd = (event: Event): void => {
    composing = false;
    const text: string = (event as CompositionEvent).data;
    run(text === '' ? { name: 'compositionCancel' } : { name: 'compositionCommit' });
    sink.value = '';
    typed();
  };
  const onInput = (): void => {
    if (!composing) sink.value = '';
  };
  const onBlur = (): void => {
    if (composing) {
      composing = false;
      run({ name: 'compositionCancel' });
    }
    breakGroup();
  };

  const listeners: ReadonlyArray<readonly [string, (event: Event) => void]> = [
    ['keydown', onKeyDown], ['beforeinput', onBeforeInput], ['compositionstart', onCompositionStart],
    ['compositionupdate', onCompositionUpdate], ['compositionend', onCompositionEnd], ['input', onInput], ['blur', onBlur],
    ['paste', onPaste],
  ];
  for (const [type, listener] of listeners) sink.addEventListener(type, listener);
  return (): void => {
    if (pause !== null) clearTimeout(pause);
    for (const [type, listener] of listeners) sink.removeEventListener(type, listener);
  };
}
