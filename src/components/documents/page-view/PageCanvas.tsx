/**
 * One painted page: its canvas, its links as real anchors over the sheet, and the two overlay
 * canvases the editor draws selection and caret into (reserved; empty until the editor lands).
 *
 * The page canvas is created per mount rather than rendered by React: a canvas whose control
 * moved to the worker can never be transferred again, so a remount (StrictMode, a key change)
 * must get a fresh element, never reuse the old one.
 */
import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { LinkArea } from '@/lib/cdoc/paint/page-painter';
import type { PageRenderer } from '@/lib/cdoc/paint/page-renderer';
import { RASTERIZER_OPTIONS } from '@/lib/cdoc/paint/paint-config';
import type { PageBox } from './page-layout';

interface PageCanvasProps {
  readonly renderer: PageRenderer;
  readonly box: PageBox;
  readonly left: number;
  readonly zoom: number;
  readonly dpr: number;
  readonly pageCount: number;
  readonly onPaintError: (error: unknown) => void;
}

interface Mounted {
  readonly slot: number;
  readonly ready: Promise<void>;
}

let nextSlot: number = 0;

export function PageCanvas({ renderer, box, left, zoom, dpr, pageCount, onPaintError }: PageCanvasProps): JSX.Element {
  const host: RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
  const mounted: MutableRefObject<Mounted | null> = useRef<Mounted | null>(null);
  const [links, setLinks] = useState<readonly LinkArea[]>([]);
  const pageNumber: number = box.pageNumber;

  useEffect((): (() => void) | undefined => {
    const el: HTMLDivElement | null = host.current;
    if (el === null) return undefined;
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.className = 'absolute inset-0 h-full w-full';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.layer = 'page';
    el.prepend(canvas);
    const slot: number = nextSlot++;
    mounted.current = { slot, ready: renderer.mount(slot, canvas) };
    return (): void => {
      mounted.current = null;
      renderer.unmount(slot);
      canvas.remove();
    };
  }, [renderer]);

  useEffect((): (() => void) | undefined => {
    const m: Mounted | null = mounted.current;
    if (m === null) return undefined;
    let live: boolean = true;
    m.ready
      .then(() => renderer.paint(m.slot, pageNumber, zoom, dpr))
      .then((outcome) => {
        if (live) setLinks(outcome.links);
      })
      .catch((error: unknown): void => {
        if (live) onPaintError(error);
      });
    return (): void => {
      live = false;
    };
  }, [renderer, pageNumber, zoom, dpr, onPaintError]);

  return (
    <div
      ref={host}
      role="group"
      aria-label={`Page ${pageNumber + 1} of ${pageCount}`}
      data-testid="document-page"
      data-page={pageNumber}
      className="absolute shadow-md ring-1 ring-border"
      style={{ top: box.top, left, width: box.width, height: box.height, backgroundColor: RASTERIZER_OPTIONS.paper }}
    >
      <canvas data-layer="selection" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas data-layer="caret" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
      {links.map((link: LinkArea, i: number) => (
        <a
          key={`${i}:${link.target}`}
          href={link.target.trimStart()}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Link: ${link.target.trim()}`}
          className="absolute focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          style={{ left: link.x, top: link.y, width: link.w, height: link.h }}
        />
      ))}
    </div>
  );
}
