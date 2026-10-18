/**
 * The editable page view over the real cdoc-edit, with both renderers (InProcessCdocClient:
 * production host, engine and wasm). Input arrives as the browser delivers it, beforeinput,
 * composition and key events on the hidden textarea and pointer presses on a page, and the
 * effects are read back from the engine (snapshot text via a repaint, selection, overlays).
 * jsdom has no layout, so the viewport height is stated (800px) and page boxes sit at 0,0.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { inProcessRuntime, type TestRuntime } from '@/lib/cdoc/__tests__/wasm-rig';
import { EditorSession } from '@/lib/cdoc/editor/editor-session';
import type { Call } from '@/lib/cdoc/paint/__tests__/recording-canvas';
import { EditorPageView } from '../EditorPageView';
import type { PeerView } from '@/lib/cdoc/editor/controller';

const VIEWPORT_PX: number = 800;
let restore: (() => void) | null = null;
beforeEach(() => {
  const original: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => VIEWPORT_PX });
  restore = (): void => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'clientHeight', original);
  };
});
afterEach(() => restore?.());

interface Mounted {
  readonly runtime: TestRuntime;
  readonly editor: EditorSession;
  readonly errors: unknown[];
  readonly input: HTMLTextAreaElement;
}

async function mount(mode: 'worker' | 'main-thread'): Promise<Mounted> {
  const runtime: TestRuntime = inProcessRuntime(mode);
  const editor: EditorSession = await EditorSession.open({ client: runtime.client, renderer: runtime.renderer }, 11n, { blank: true });
  const errors: unknown[] = [];
  render(
    <EditorPageView
      editor={editor} renderer={runtime.renderer} zoom={1} dpr={1} onZoomChange={() => undefined} onPageStatus={() => undefined}
      input={{ platform: 'other', undoPauseMs: 60_000, onError: (e: unknown) => errors.push(e), overlayContext: runtime.overlayContext }}
    />,
  );
  const input: HTMLTextAreaElement = await screen.findByTestId('editor-input') as HTMLTextAreaElement;
  await waitFor(() => expect(runtime.painted.some((t) => t.sizes.length > 0)).toBe(true));
  return { runtime, editor, errors, input };
}

function type(input: HTMLElement, text: string): void {
  for (const ch of text) {
    act(() => { input.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: ch, bubbles: true, cancelable: true })); });
  }
}

function key(input: HTMLElement, k: string, mods: KeyboardEventInit = {}): void {
  act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods })); });
}

/** The text of page 0 as the engine has it: select all and read the selection's rect count. */
async function settled(editor: EditorSession): Promise<void> {
  await act(async () => { await editor.awareness(); });
}

const fills = (calls: readonly Call[]): number => calls.filter((c) => c.name === 'fillRect').length;

describe.each(['worker', 'main-thread'] as const)('EditorPageView with the %s renderer', (mode) => {
  it('types through beforeinput, moving the caret and repainting the page', async () => {
    const { runtime, editor, input, errors } = await mount(mode);
    const before: number = runtime.painted.reduce((n, t) => n + t.sizes.length, 0);
    type(input, 'Hello');
    await settled(editor);
    expect(errors).toEqual([]);
    expect(editor.state.caret?.rect.x).toBeGreaterThan(7200);
    await waitFor(() => expect(runtime.painted.reduce((n, t) => n + t.sizes.length, 0)).toBeGreaterThan(before));
  });

  it('repaints only the pages an edit dirtied', async () => {
    const { runtime, editor, input } = await mount(mode);
    await act(async () => { await editor.execute({ name: 'insertText', text: 'line\n'.repeat(70) }); });
    await waitFor(() => expect(screen.getAllByTestId('document-page').length).toBeGreaterThanOrEqual(2));
    await act(async () => { await editor.execute({ name: 'moveCaret', granularity: 'document', forward: false, extend: false }); });
    const pageTargets = (): number[] => runtime.painted.map((t) => t.sizes.length);
    await waitFor(() => expect(pageTargets().filter((n) => n > 0).length).toBeGreaterThanOrEqual(2));
    const before: number[] = pageTargets();
    type(input, 'q');
    await settled(editor);
    await waitFor(() => expect(pageTargets().some((n, i) => n > (before[i] ?? 0))).toBe(true));
    const grew: number = pageTargets().filter((n, i) => n > (before[i] ?? 0)).length;
    expect(grew).toBe(1);
  });

  it('maps Backspace and Ctrl+Z through the keymap', async () => {
    const { editor, input } = await mount(mode);
    type(input, 'ab');
    await settled(editor);
    const typed: number = editor.state.caret?.rect.x ?? 0;
    key(input, 'Backspace');
    await settled(editor);
    expect(editor.state.caret?.rect.x).toBeLessThan(typed);
    key(input, 'z', { ctrlKey: true });
    key(input, 'z', { ctrlKey: true });
    await settled(editor);
    expect(editor.state.caret?.rect.x).toBeLessThan(typed);
  });

  it('commits an IME composition as typed text', async () => {
    const { editor, input } = await mount(mode);
    const start: number = editor.state.caret?.rect.x ?? 0;
    act(() => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true }));
      input.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'にほ', bubbles: true }));
      input.dispatchEvent(new CompositionEvent('compositionupdate', { data: '日本', bubbles: true }));
    });
    await settled(editor);
    expect(editor.state.composing).toBe(true);
    act(() => { input.dispatchEvent(new CompositionEvent('compositionend', { data: '日本', bubbles: true })); });
    await settled(editor);
    expect(editor.state.composing).toBe(false);
    expect(editor.state.caret?.rect.x).toBeGreaterThan(start);
  });

  it('ends the undo step on blur, so undo keeps what was typed before it', async () => {
    const { editor, input } = await mount(mode);
    type(input, 'keep');
    act(() => { input.dispatchEvent(new FocusEvent('blur')); });
    type(input, 'drop');
    await settled(editor);
    const both: number = editor.state.caret?.rect.x ?? 0;
    key(input, 'z', { ctrlKey: true });
    await settled(editor);
    const after: number = editor.state.caret?.rect.x ?? 0;
    expect(after).toBeLessThan(both);
    expect(after).toBeGreaterThan(7200);
  });

  it('selects a word on a double press and draws its highlight on the selection overlay', async () => {
    const { runtime, editor, input } = await mount(mode);
    type(input, 'alpha beta');
    await settled(editor);
    const page: HTMLElement = screen.getAllByTestId('document-page')[0];
    const css: number = 96 / 7200;
    act(() => {
      page.dispatchEvent(new MouseEvent('pointerdown', { button: 0, detail: 2, clientX: 7400 * css, clientY: 7300 * css, bubbles: true, cancelable: true }));
    });
    await settled(editor);
    await waitFor(() => expect(editor.state.selectionRects).toHaveLength(1));
    const selection: HTMLCanvasElement | null = page.querySelector('canvas[data-layer="selection"]');
    await waitFor(() => expect(fills(runtime.overlays.get(selection as HTMLCanvasElement)?.calls ?? [])).toBeGreaterThan(0));
  });

  it('draws the caret, and peers with their names, on the caret overlay', async () => {
    const { runtime, editor, input } = await mount(mode);
    type(input, 'x');
    await settled(editor);
    const view: PeerView = await editor.peerView(await editor.awareness());
    act(() => { editor.peers.setPeers([{ name: 'Ada', color: '#aa00ff', view: { ...view, client: 99n } }]); });
    const caret: HTMLCanvasElement | null = screen.getAllByTestId('document-page')[0].querySelector('canvas[data-layer="caret"]');
    await waitFor(() => {
      const calls: readonly Call[] = runtime.overlays.get(caret as HTMLCanvasElement)?.calls ?? [];
      expect(calls.some((c) => c.name === 'fillText' && c.args[0] === 'Ada')).toBe(true);
      expect(fills(calls)).toBeGreaterThanOrEqual(3);
    });
  });
});
