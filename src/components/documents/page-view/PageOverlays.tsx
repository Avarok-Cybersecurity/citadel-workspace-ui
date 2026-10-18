/**
 * The selection and caret canvases over one page, painted on the main thread from the
 * editor's state and the peers collaboration hands it. Sized in device px exactly like the
 * page canvas, so a highlight and the glyphs under it use the same pixel grid.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { paintCaretLayer, paintPeerLayer, paintSelectionLayer, type OverlayScene } from '@/lib/cdoc/paint/overlay-painter';
import { OVERLAY_STYLE } from '@/lib/cdoc/paint/paint-config';
import { deviceScale, pageSizePx, type DeviceScale } from '@/lib/cdoc/paint/units';
import type { Ctx2D } from '@/lib/cdoc/paint/canvas-port';

/** A 2D context for an overlay canvas: the DOM's in the app, a recording one in tests. */
export type OverlayContextOf = (canvas: HTMLCanvasElement) => Ctx2D;

export interface PageOverlaysProps {
  /** The page's size in Pt100. */
  readonly width: number;
  readonly height: number;
  readonly scene: OverlayScene;
  readonly contextOf: OverlayContextOf;
  /** The local caret's blink phase: its canvas is shown or hidden, never repainted for it. */
  readonly caretShown: boolean;
}

function sized(canvas: HTMLCanvasElement, w: number, h: number, contextOf: OverlayContextOf): Ctx2D {
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return contextOf(canvas);
}

export function PageOverlays({ width, height, scene, contextOf, caretShown }: PageOverlaysProps): JSX.Element {
  const selection: RefObject<HTMLCanvasElement> = useRef<HTMLCanvasElement>(null);
  const peers: RefObject<HTMLCanvasElement> = useRef<HTMLCanvasElement>(null);
  const caret: RefObject<HTMLCanvasElement> = useRef<HTMLCanvasElement>(null);
  // A scene is rebuilt on every render; it is repainted only when what it shows changes.
  const { page, selection: rects, caret: caretRect, peers: presences } = scene;
  const { zoom, dpr } = scene.scale;

  useLayoutEffect((): void => {
    const scale: DeviceScale = deviceScale(zoom, dpr);
    const now: OverlayScene = { page, scale, selection: rects, caret: caretRect, peers: presences };
    const size: { readonly w: number; readonly h: number } = pageSizePx(width, height, scale);
    if (selection.current === null || peers.current === null || caret.current === null) return;
    paintSelectionLayer(sized(selection.current, size.w, size.h, contextOf), size.w, size.h, now, OVERLAY_STYLE);
    paintPeerLayer(sized(peers.current, size.w, size.h, contextOf), size.w, size.h, now, OVERLAY_STYLE);
    paintCaretLayer(sized(caret.current, size.w, size.h, contextOf), size.w, size.h, now, OVERLAY_STYLE);
  }, [width, height, page, zoom, dpr, rects, caretRect, presences, contextOf]);

  return (
    <>
      <canvas ref={selection} data-layer="selection" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas ref={peers} data-layer="peers" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas
        ref={caret} data-layer="caret" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ visibility: caretShown ? 'visible' : 'hidden' }}
      />
    </>
  );
}
