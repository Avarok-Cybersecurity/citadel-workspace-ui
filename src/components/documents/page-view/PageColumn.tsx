/**
 * The scrolling column of pages both page views share: lays the pages out, paints only the
 * pages in view, one either side, and handles zoom gestures. Zoom and DPR are the caller's
 * (explicit); Ctrl/⌘+wheel and Ctrl/⌘ +, −, 0 ask the caller to change zoom. The column is a
 * focusable region, so the keyboard scrolls it, and "Page N of M" goes to `onPageStatus`.
 * An editable view adds per-page repaint revisions and overlay scenes (`editing`).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from 'react';
import type { PageRenderer } from '@/lib/cdoc/paint/page-renderer';
import { deviceScale, type DeviceScale } from '@/lib/cdoc/paint/units';
import type { OverlayScene } from '@/lib/cdoc/paint/overlay-painter';
import type { PageRect } from '@/lib/cdoc/editor/controller';
import type { OverlayContextOf } from './PageOverlays';
import { PageCanvas } from './PageCanvas';
import { currentPage, layoutPages, visiblePages, type PageBox, type PageLayout } from './page-layout';
import { INITIAL_ZOOM, zoomBySteps, zoomByWheel } from './zoom';

/** Space between pages and around the column, CSS px. */
export const PAGE_GAP_PX: number = 24;
/** Pages painted beyond the visible ones, each side. */
const OVERSCAN_PAGES: number = 1;

export interface PageStatus {
  readonly current: number;
  readonly total: number;
}

export interface ColumnEditing {
  readonly revisionOf: (page: number) => number;
  readonly sceneOf: (page: number, scale: DeviceScale) => OverlayScene;
  readonly overlayContext: OverlayContextOf;
  /** The local caret: the hidden textarea sits there, so an IME's candidate window does too. */
  readonly caret: PageRect | null;
}

export interface PageColumnProps {
  readonly renderer: PageRenderer;
  /** Width, height pairs in Pt100; null while the document opens. */
  readonly sizes: Int32Array | null;
  readonly zoom: number;
  readonly dpr: number;
  readonly onZoomChange: (zoom: number) => void;
  readonly onPageStatus: (status: PageStatus) => void;
  readonly scroller: RefObject<HTMLDivElement>;
  /** Null for a read-only view. */
  readonly editing: ColumnEditing | null;
  /** Rendered inside the scrolling region (the editor's hidden textarea). */
  readonly children: ReactNode;
}

export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function caretAnchor(layout: PageLayout, columnWidth: number, caret: PageRect | null, scale: DeviceScale): { top: number; left: number } {
  const box: PageBox | undefined = caret === null ? undefined : layout.boxes[caret.page];
  if (caret === null || box === undefined) return { top: 0, left: 0 };
  return { top: box.top + caret.rect.y * scale.css, left: (columnWidth - box.width) / 2 + caret.rect.x * scale.css };
}

export function PageColumn({ renderer, sizes, zoom, dpr, onZoomChange, onPageStatus, scroller, editing, children }: PageColumnProps): JSX.Element {
  const [viewport, setViewport] = useState<{ readonly top: number; readonly height: number; readonly width: number }>({ top: 0, height: 0, width: 0 });
  const zoomRef: MutableRefObject<number> = useRef<number>(zoom);
  const lastZoom: MutableRefObject<number> = useRef<number>(zoom);
  const opening: boolean = sizes === null;

  const layout: PageLayout | null = useMemo(
    () => (sizes === null ? null : layoutPages(sizes, deviceScale(zoom, dpr), PAGE_GAP_PX)),
    [sizes, zoom, dpr],
  );

  const measure: () => void = useCallback((): void => {
    const el: HTMLDivElement | null = scroller.current;
    if (el !== null) setViewport({ top: el.scrollTop, height: el.clientHeight, width: el.clientWidth });
  }, [scroller]);

  useLayoutEffect((): void => {
    const el: HTMLDivElement | null = scroller.current;
    if (el !== null && lastZoom.current !== zoom) {
      // Keep the same part of the document under the viewport's middle while zooming.
      const middle: number = el.scrollTop + el.clientHeight / 2;
      el.scrollTop = Math.max(0, (middle * zoom) / lastZoom.current - el.clientHeight / 2);
    }
    lastZoom.current = zoom;
    zoomRef.current = zoom;
    measure();
  }, [zoom, measure, layout, scroller]);

  useEffect((): (() => void) | undefined => {
    const el: HTMLDivElement | null = scroller.current;
    if (el === null) return undefined;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      onZoomChange(zoomByWheel(zoomRef.current, event.deltaY));
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      const next: number | null = event.key === '=' || event.key === '+' ? zoomBySteps(zoomRef.current, 1)
        : event.key === '-' ? zoomBySteps(zoomRef.current, -1)
        : event.key === '0' ? INITIAL_ZOOM : null;
      if (next === null) return;
      event.preventDefault();
      onZoomChange(next);
    };
    const resize: ResizeObserver = new ResizeObserver(measure);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('keydown', onKeyDown);
    resize.observe(el);
    return (): void => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('keydown', onKeyDown);
      resize.disconnect();
    };
  }, [onZoomChange, measure, scroller, opening]);

  const total: number = layout?.boxes.length ?? 0;
  const current: number = layout === null ? 0 : currentPage(layout, viewport.top, viewport.height);
  useEffect((): void => {
    if (total > 0) onPageStatus({ current: current + 1, total });
  }, [current, total, onPageStatus]);

  const [paintError, setPaintError] = useState<string | null>(null);
  const onPaintError: (error: unknown) => void = useCallback((error: unknown): void => setPaintError(messageOf(error)), []);

  const painted: readonly PageBox[] = layout === null ? [] : visiblePages(layout, viewport.top, viewport.height, OVERSCAN_PAGES).map((n: number) => layout.boxes[n]);
  const columnWidth: number = Math.max(layout?.width ?? 0, viewport.width);
  return (
    <div
      ref={scroller}
      role="region"
      aria-label="Document pages"
      aria-busy={opening}
      tabIndex={0}
      data-testid="page-view"
      onScroll={measure}
      className="relative h-full min-h-0 flex-1 overflow-auto bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {layout === null && children}
      {paintError !== null && <p role="alert" className="sticky top-0 z-10 bg-background p-2 text-sm text-destructive">A page could not be painted. {paintError}</p>}
      {layout !== null && (
        <div className="relative" style={{ width: columnWidth, height: layout.height }}>
          {painted.map((box: PageBox) => (
            <PageCanvas
              key={box.pageNumber} renderer={renderer} box={box} left={(columnWidth - box.width) / 2} zoom={zoom} dpr={dpr} pageCount={total}
              onPaintError={onPaintError} revision={editing?.revisionOf(box.pageNumber) ?? 0}
              overlay={editing === null || sizes === null ? null : {
                width: sizes[2 * box.pageNumber], height: sizes[2 * box.pageNumber + 1],
                scene: editing.sceneOf(box.pageNumber, deviceScale(zoom, dpr)), contextOf: editing.overlayContext,
              }}
            />
          ))}
          {/* Always mounted here once laid out, so the textarea never remounts (and never drops
              focus or its listeners) as the caret comes and goes; it only moves. */}
          <div className="pointer-events-none absolute" style={caretAnchor(layout, columnWidth, editing?.caret ?? null, deviceScale(zoom, dpr))}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
