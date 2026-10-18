/**
 * Mouse and pen on the pages -> selection. A press hit-tests to a position and collapses the
 * selection there (Shift extends from the anchor); a double press selects the word, a triple
 * press the paragraph; a drag extends from where it began. Hit tests are coalesced while one is
 * in flight, so a fast drag costs one round trip per frame-ish, the latest point winning.
 */
import type { EditorController, EditorPosition } from '../controller';

/** A point on a page in Pt100 page space. */
export interface PagePoint {
  readonly page: number;
  readonly x: number;
  readonly y: number;
}

export interface PointerOptions {
  /** The page point under a client point, or null when it is not over a page. */
  readonly locate: (target: EventTarget | null, clientX: number, clientY: number) => PagePoint | null;
  readonly onError: (error: unknown) => void;
  /** Called on every press over a page, so the keyboard follows the click. */
  readonly focus: () => void;
}

export function attachPointer(surface: EventTarget, editor: EditorController, options: PointerOptions): () => void {
  let dragAnchor: EditorPosition | null = null;
  let inFlight: boolean = false;
  let queued: PagePoint | null = null;

  const extendTo = (point: PagePoint): void => {
    if (inFlight) {
      queued = point;
      return;
    }
    inFlight = true;
    editor
      .hitTest(point.page, point.x, point.y)
      .then((head: EditorPosition) => (dragAnchor === null ? undefined : editor.execute({ name: 'setSelection', anchor: dragAnchor, head })))
      .catch(options.onError)
      .finally((): void => {
        inFlight = false;
        const next: PagePoint | null = queued;
        queued = null;
        if (next !== null && dragAnchor !== null) extendTo(next);
      });
  };

  const onDown = (event: Event): void => {
    const e: PointerEvent = event as PointerEvent;
    if (e.button !== 0) return;
    const point: PagePoint | null = options.locate(e.target, e.clientX, e.clientY);
    if (point === null) return;
    e.preventDefault();
    options.focus();
    const clicks: number = e.detail;
    const shift: boolean = e.shiftKey;
    const anchorBefore: EditorPosition = editor.state.anchor;
    editor
      .hitTest(point.page, point.x, point.y)
      .then((at: EditorPosition) => {
        if (clicks >= 3) return editor.execute({ name: 'selectParagraph', at });
        if (clicks === 2) return editor.execute({ name: 'selectWord', at });
        dragAnchor = shift ? anchorBefore : at;
        return editor.execute({ name: 'setSelection', anchor: dragAnchor, head: at });
      })
      .catch(options.onError);
  };

  const onMove = (event: Event): void => {
    const e: PointerEvent = event as PointerEvent;
    if (dragAnchor === null || (e.buttons & 1) === 0) return;
    const point: PagePoint | null = options.locate(e.target, e.clientX, e.clientY);
    if (point !== null) extendTo(point);
  };

  const onUp = (): void => {
    dragAnchor = null;
    queued = null;
  };

  surface.addEventListener('pointerdown', onDown);
  surface.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerup', onUp);
  surface.addEventListener('pointercancel', onUp);
  return (): void => {
    surface.removeEventListener('pointerdown', onDown);
    surface.removeEventListener('pointermove', onMove);
    surface.removeEventListener('pointerup', onUp);
    surface.removeEventListener('pointercancel', onUp);
  };
}
