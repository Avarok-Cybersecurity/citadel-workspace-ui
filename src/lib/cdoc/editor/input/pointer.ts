/**
 * Mouse and pen on the pages -> selection. A press hit-tests to a position and collapses the
 * selection there (Shift extends from the anchor); a double press selects the word, a triple
 * press the paragraph; a drag extends from where it began. Hit tests are coalesced while one is
 * in flight, so a fast drag costs one round trip per frame-ish, the latest point winning.
 *
 * A drag captures the pointer, so it keeps selecting outside the pages, and held near the
 * viewport's top or bottom edge it scrolls, faster the nearer the edge, extending as it goes.
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
  /** A drag selection started or ended (the caret stops blinking while it lasts). */
  readonly onDragChange: (dragging: boolean) => void;
  readonly autoScroll: AutoScroll;
}

/** Scrolling while a drag is held near the viewport's edge. */
export interface AutoScroll {
  /** How near the top or bottom edge, CSS px, a drag starts scrolling. */
  readonly edgePx: number;
  /** The scroll per frame at the very edge, CSS px; it falls to 0 at `edgePx` in. */
  readonly maxStepPx: number;
  /** The viewport's top and bottom, client px. */
  readonly viewport: () => { readonly top: number; readonly bottom: number };
  readonly scrollBy: (dy: number) => void;
  /** Runs `task` on the next frame; the result cancels it. */
  readonly frame: (task: () => void) => () => void;
}

/** The scroll per frame for a drag at `clientY`: negative up, positive down, 0 away from the edges. */
export function autoScrollStep(clientY: number, view: { readonly top: number; readonly bottom: number }, edgePx: number, maxStepPx: number): number {
  const into = (depth: number): number => Math.min(1, Math.max(0, depth / edgePx)) * maxStepPx;
  if (clientY < view.top + edgePx) return -into(view.top + edgePx - clientY);
  if (clientY > view.bottom - edgePx) return into(clientY - (view.bottom - edgePx));
  return 0;
}

export function attachPointer(surface: EventTarget, editor: EditorController, options: PointerOptions): () => void {
  let dragAnchor: EditorPosition | null = null;
  let inFlight: boolean = false;
  let queued: PagePoint | null = null;
  /** The button is down after a single press: a drag may select. */
  let pressed: boolean = false;
  let held: { readonly target: EventTarget | null; readonly x: number; readonly y: number } | null = null;
  let cancelFrame: (() => void) | null = null;
  const { autoScroll } = options;

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

  const scrollFrame = (): void => {
    cancelFrame = null;
    if (held === null || dragAnchor === null) return;
    const step: number = autoScrollStep(held.y, autoScroll.viewport(), autoScroll.edgePx, autoScroll.maxStepPx);
    if (step === 0) return;
    autoScroll.scrollBy(step);
    const point: PagePoint | null = options.locate(held.target, held.x, held.y);
    if (point !== null) extendTo(point);
    cancelFrame = autoScroll.frame(scrollFrame);
  };

  const onDown = (event: Event): void => {
    const e: PointerEvent = event as PointerEvent;
    if (e.button !== 0) return;
    const point: PagePoint | null = options.locate(e.target, e.clientX, e.clientY);
    if (point === null) return;
    e.preventDefault();
    options.focus();
    if (surface instanceof Element && typeof surface.setPointerCapture === 'function') surface.setPointerCapture(e.pointerId);
    const clicks: number = e.detail;
    const shift: boolean = e.shiftKey;
    if (clicks < 2) {
      pressed = true;
      options.onDragChange(true);
    }
    const anchorBefore: EditorPosition = editor.state.anchor;
    editor
      .hitTest(point.page, point.x, point.y)
      .then((at: EditorPosition) => {
        if (clicks >= 3) return editor.execute({ name: 'selectParagraph', at });
        if (clicks === 2) return editor.execute({ name: 'selectWord', at });
        const anchor: EditorPosition = shift ? anchorBefore : at;
        // Released before the hit test answered: a click, with nothing left to drag.
        dragAnchor = pressed ? anchor : null;
        return editor.execute({ name: 'setSelection', anchor, head: at });
      })
      .catch(options.onError);
  };

  const onMove = (event: Event): void => {
    const e: PointerEvent = event as PointerEvent;
    if (dragAnchor === null || (e.buttons & 1) === 0) return;
    held = { target: e.target, x: e.clientX, y: e.clientY };
    const point: PagePoint | null = options.locate(e.target, e.clientX, e.clientY);
    if (point !== null) extendTo(point);
    if (cancelFrame === null) cancelFrame = autoScroll.frame(scrollFrame);
  };

  const onUp = (): void => {
    if (pressed) options.onDragChange(false);
    pressed = false;
    dragAnchor = null;
    queued = null;
    held = null;
    cancelFrame?.();
    cancelFrame = null;
  };

  surface.addEventListener('pointerdown', onDown);
  surface.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerup', onUp);
  surface.addEventListener('pointercancel', onUp);
  return (): void => {
    cancelFrame?.();
    surface.removeEventListener('pointerdown', onDown);
    surface.removeEventListener('pointermove', onMove);
    surface.removeEventListener('pointerup', onUp);
    surface.removeEventListener('pointercancel', onUp);
  };
}
