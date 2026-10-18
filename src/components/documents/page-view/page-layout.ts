/**
 * Where each page sits in the scrolling column, in CSS px, and which pages to paint. Pure:
 * sizes in, boxes out. A page's CSS size is its device-pixel canvas size divided by the DPR,
 * and its top and left fall on whole device pixels, so the canvas maps 1:1 onto screen pixels
 * and is never resampled: a page at a half device pixel is redrawn by the compositor between
 * two pixel columns, and every glyph edge blurs by a pixel.
 */
import { pageSizeCss, type DeviceScale } from '@/lib/cdoc/paint/units';

export interface PageBox {
  readonly pageNumber: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PageLayout {
  readonly boxes: readonly PageBox[];
  /** The column: widest page plus a gap either side; every page plus a gap between each. */
  readonly width: number;
  readonly height: number;
}

/** `sizes` holds width, height pairs in Pt100 (OpenedDocument.pageSizes). */
export function layoutPages(sizes: Int32Array, scale: DeviceScale, gapPx: number): PageLayout {
  // Whole CSS sizes; each top rounded onto the device-pixel grid from the exact running total.
  const onGrid = (css: number): number => Math.round(css * scale.dpr) / scale.dpr;
  const boxes: PageBox[] = [];
  let top: number = gapPx;
  let widest: number = 0;
  for (let i: number = 0; i < sizes.length / 2; i++) {
    const css: { readonly w: number; readonly h: number } = pageSizeCss(sizes[2 * i], sizes[2 * i + 1], scale);
    boxes.push({ pageNumber: i, top: onGrid(top), width: css.w, height: css.h });
    widest = Math.max(widest, css.w);
    top += css.h + gapPx;
  }
  return { boxes, width: widest + 2 * gapPx, height: onGrid(top) };
}

/** The CSS px to add to a position so it lands on a whole device pixel (|result| ≤ half a device px). */
export function deviceResidue(cssPx: number, dpr: number): number {
  return Math.round(cssPx * dpr) / dpr - cssPx;
}

/**
 * A page's left edge in the column, CSS px: centred, then moved to the nearest whole device
 * pixel of the screen. `columnLeft` is where the column itself starts on screen (its client
 * rect), which the app's layout may put at a fraction of a device pixel.
 */
export function pageLeft(columnWidth: number, pageWidth: number, columnLeft: number, dpr: number): number {
  const centred: number = (columnWidth - pageWidth) / 2;
  return centred + deviceResidue(columnLeft + centred, dpr);
}

/** The pages any part of which is in the viewport, widened by `overscan` pages each side. */
export function visiblePages(layout: PageLayout, scrollTop: number, viewportHeight: number, overscan: number): number[] {
  const bottom: number = scrollTop + viewportHeight;
  const seen: number[] = layout.boxes
    .filter((b: PageBox): boolean => b.top + b.height >= scrollTop && b.top <= bottom)
    .map((b: PageBox): number => b.pageNumber);
  if (seen.length === 0) {
    // Between pages (in a gap) or above the first: the nearest page below is the one in view.
    const next: PageBox | undefined = layout.boxes.find((b: PageBox): boolean => b.top > scrollTop) ?? layout.boxes[layout.boxes.length - 1];
    if (next === undefined) return [];
    seen.push(next.pageNumber);
  }
  const first: number = Math.max(0, seen[0] - overscan);
  const last: number = Math.min(layout.boxes.length - 1, seen[seen.length - 1] + overscan);
  return Array.from({ length: last - first + 1 }, (_: unknown, i: number): number => first + i);
}

/** The page under the viewport's middle line: what "Page N of M" reports. */
export function currentPage(layout: PageLayout, scrollTop: number, viewportHeight: number): number {
  const middle: number = scrollTop + viewportHeight / 2;
  let current: number = 0;
  for (const box of layout.boxes) {
    if (box.top <= middle) current = box.pageNumber;
  }
  return current;
}
