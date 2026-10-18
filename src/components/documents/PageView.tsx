/**
 * The page view: opens a document in cdoc, lays its pages out in one scrolling column and
 * paints only the pages in view, one either side. Zoom and DPR are the caller's (explicit);
 * Ctrl/⌘+wheel and Ctrl/⌘ +, −, 0 ask the caller to change zoom. The column is a focusable
 * region, so the keyboard scrolls it, and "Page N of M" is reported through `onPageStatus`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { DocumentSource } from '@/lib/cdoc/document-source';
import type { CdocClient } from '@/lib/cdoc/worker/cdoc-client';
import type { PageRenderer } from '@/lib/cdoc/paint/page-renderer';
import { deviceScale } from '@/lib/cdoc/paint/units';
import { PageCanvas } from './page-view/PageCanvas';
import { currentPage, layoutPages, visiblePages, type PageBox, type PageLayout } from './page-view/page-layout';
import { INITIAL_ZOOM, zoomBySteps, zoomByWheel } from './page-view/zoom';

/** Space between pages and around the column, CSS px. */
export const PAGE_GAP_PX: number = 24;
/** Pages painted beyond the visible ones, each side. */
const OVERSCAN_PAGES: number = 1;

export interface PageStatus {
  readonly current: number;
  readonly total: number;
}

export interface PageViewProps {
  readonly client: CdocClient;
  readonly renderer: PageRenderer;
  readonly source: DocumentSource;
  readonly zoom: number;
  readonly dpr: number;
  readonly onZoomChange: (zoom: number) => void;
  readonly onPageStatus: (status: PageStatus) => void;
}

type Opened = { readonly kind: 'opening' } | { readonly kind: 'open'; readonly sizes: Int32Array } | { readonly kind: 'failed'; readonly message: string };

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function PageView({ client, renderer, source, zoom, dpr, onZoomChange, onPageStatus }: PageViewProps): JSX.Element {
  const scroller: RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<Opened>({ kind: 'opening' });
  const [viewport, setViewport] = useState<{ readonly top: number; readonly height: number; readonly width: number }>({ top: 0, height: 0, width: 0 });
  const zoomRef: MutableRefObject<number> = useRef<number>(zoom);
  const lastZoom: MutableRefObject<number> = useRef<number>(zoom);

  useEffect((): (() => void) => {
    let live: boolean = true;
    setOpened({ kind: 'opening' });
    renderer.reset();
    client.request({ kind: 'open', source }).then(
      (doc) => { if (live) setOpened({ kind: 'open', sizes: doc.pageSizes }); },
      (error: unknown) => { if (live) setOpened({ kind: 'failed', message: messageOf(error) }); },
    );
    return (): void => { live = false; };
  }, [client, renderer, source]);

  const layout: PageLayout | null = useMemo(
    () => (opened.kind === 'open' ? layoutPages(opened.sizes, deviceScale(zoom, dpr), PAGE_GAP_PX) : null),
    [opened, zoom, dpr],
  );

  const measure: () => void = useCallback((): void => {
    const el: HTMLDivElement | null = scroller.current;
    if (el !== null) setViewport({ top: el.scrollTop, height: el.clientHeight, width: el.clientWidth });
  }, []);

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
  }, [zoom, measure, layout]);

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
  }, [onZoomChange, measure, opened.kind]);

  const total: number = layout?.boxes.length ?? 0;
  const current: number = layout === null ? 0 : currentPage(layout, viewport.top, viewport.height);
  useEffect((): void => {
    if (total > 0) onPageStatus({ current: current + 1, total });
  }, [current, total, onPageStatus]);

  const [paintError, setPaintError] = useState<string | null>(null);
  const onPaintError: (error: unknown) => void = useCallback((error: unknown): void => setPaintError(messageOf(error)), []);

  if (opened.kind === 'failed') {
    return <p role="alert" data-testid="page-view-error" className="p-6 text-sm text-destructive">This document could not be opened. {opened.message}</p>;
  }
  const painted: readonly PageBox[] = layout === null ? [] : visiblePages(layout, viewport.top, viewport.height, OVERSCAN_PAGES).map((n: number) => layout.boxes[n]);
  const columnWidth: number = Math.max(layout?.width ?? 0, viewport.width);
  return (
    <div
      ref={scroller}
      role="region"
      aria-label="Document pages"
      aria-busy={opened.kind === 'opening'}
      tabIndex={0}
      data-testid="page-view"
      onScroll={measure}
      className="relative h-full min-h-0 flex-1 overflow-auto bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {paintError !== null && <p role="alert" className="sticky top-0 z-10 bg-background p-2 text-sm text-destructive">A page could not be painted. {paintError}</p>}
      {layout !== null && (
        <div className="relative" style={{ width: columnWidth, height: layout.height }}>
          {painted.map((box: PageBox) => (
            <PageCanvas key={box.pageNumber} renderer={renderer} box={box} left={(columnWidth - box.width) / 2} zoom={zoom} dpr={dpr} pageCount={total} onPaintError={onPaintError} />
          ))}
        </div>
      )}
    </div>
  );
}
