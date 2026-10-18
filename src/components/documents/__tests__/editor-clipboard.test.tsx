/**
 * The clipboard on the editor's textarea, as the browser delivers it (Ctrl/⌘+V is the
 * browser's own paste event there, so no key handler is involved). R1 pastes text/plain only.
 * jsdom has no ClipboardEvent or DataTransfer, so the event carries a stand-in clipboardData.
 */
import { describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { key, mount, settled, statedViewport, type, type Mounted } from './editor-harness';

statedViewport();

function paste(input: HTMLElement, text: string): Event {
  const event: Event = new Event('paste', { bubbles: true, cancelable: true });
  const clipboardData: Pick<DataTransfer, 'getData'> = { getData: (format: string): string => (format === 'text/plain' ? text : '') };
  Object.defineProperty(event, 'clipboardData', { value: clipboardData });
  act(() => { input.dispatchEvent(event); });
  return event;
}

const caretX = (m: Mounted): number => m.editor.state.caret?.rect.x ?? Number.NaN;
const caretY = (m: Mounted): number => m.editor.state.caret?.rect.y ?? Number.NaN;

describe('pasting into the editor', () => {
  it('enters the clipboard text where the caret is, instead of the textarea taking it', async () => {
    const m: Mounted = await mount('worker');
    const start: number = caretX(m);
    const event: Event = paste(m.input, 'abc');
    await settled(m.editor);
    expect(event.defaultPrevented).toBe(true);
    expect(m.input.value).toBe('');
    const pasted: number = caretX(m);
    expect(pasted).toBeGreaterThan(start);
    key(m.input, 'z', { ctrlKey: true });
    await settled(m.editor);
    type(m.input, 'abc');
    await settled(m.editor);
    expect(caretX(m)).toBe(pasted);
    expect(m.errors).toEqual([]);
  });

  it('is one undo step of its own: undo takes the paste and keeps what was typed before it', async () => {
    const m: Mounted = await mount('worker');
    const start: number = caretX(m);
    type(m.input, 'x');
    await settled(m.editor);
    const typed: number = caretX(m);
    paste(m.input, 'pasted');
    await settled(m.editor);
    key(m.input, 'z', { ctrlKey: true });
    await settled(m.editor);
    expect(caretX(m)).toBe(typed);
    expect(typed).toBeGreaterThan(start);
  });

  it('reads Windows and old Mac line endings as paragraph breaks', async () => {
    const m: Mounted = await mount('worker');
    const firstLine: number = caretY(m);
    paste(m.input, 'one\ntwo');
    await settled(m.editor);
    const unix: number = caretY(m);
    expect(unix).toBeGreaterThan(firstLine);
    key(m.input, 'z', { ctrlKey: true });
    await settled(m.editor);
    paste(m.input, 'one\r\ntwo');
    await settled(m.editor);
    expect(caretY(m)).toBe(unix);
    key(m.input, 'z', { ctrlKey: true });
    await settled(m.editor);
    paste(m.input, 'one\rtwo');
    await settled(m.editor);
    expect(caretY(m)).toBe(unix);
  });

  it('ignores an empty clipboard', async () => {
    const m: Mounted = await mount('worker');
    const start: number = caretX(m);
    paste(m.input, '');
    await settled(m.editor);
    expect(caretX(m)).toBe(start);
    expect(m.errors).toEqual([]);
  });
});
