/**
 * How a page view gets pixels onto a page canvas, behind one interface with two answers:
 *
 * - WorkerPageRenderer: the canvas's control moves to the worker (OffscreenCanvas), which
 *   decodes, rasterises and paints there. The main thread only posts "paint page N at zoom z".
 * - MainThreadPageRenderer: for a browser without transferControlToOffscreen. The display list
 *   and outlines come from the worker; decoding and painting happen here.
 *
 * Paints of one slot are serialised: a zoom gesture can request several, and the latest wins.
 */
import { openDisplayList } from '../display-list/decoder';
import type { CdocClient } from '../worker/cdoc-client';
import type { GlyphPathBatch } from '../engine/cdoc-engine';
import type { CanvasPort, PaintTarget } from './canvas-port';
import { PageRasterizer, type PaintOutcome, type RasterizerOptions } from './page-rasterizer';
import { deviceScale } from './units';

export interface PageRenderer {
  mount(slot: number, canvas: HTMLCanvasElement): Promise<void>;
  paint(slot: number, pageNumber: number, zoom: number, dpr: number): Promise<PaintOutcome>;
  unmount(slot: number): void;
  /** Forget what was painted from the previous document (a new one was opened). */
  reset(): void;
}

class SlotQueue {
  private readonly tails: Map<number, Promise<unknown>> = new Map<number, Promise<unknown>>();

  run<T>(slot: number, task: () => Promise<T>): Promise<T> {
    const previous: Promise<unknown> = this.tails.get(slot) ?? Promise.resolve();
    const next: Promise<T> = previous.then(task, task);
    this.tails.set(slot, next.catch((): void => undefined));
    return next;
  }

  drop(slot: number): void {
    this.tails.delete(slot);
  }
}

export class WorkerPageRenderer implements PageRenderer {
  private readonly queue: SlotQueue = new SlotQueue();

  constructor(
    private readonly client: CdocClient,
    private readonly transfer: (canvas: HTMLCanvasElement) => OffscreenCanvas,
  ) {}

  async mount(slot: number, canvas: HTMLCanvasElement): Promise<void> {
    await this.client.request({ kind: 'attachCanvas', slot, canvas: this.transfer(canvas) });
  }

  paint(slot: number, pageNumber: number, zoom: number, dpr: number): Promise<PaintOutcome> {
    return this.queue.run(slot, () => this.client.request({ kind: 'paintCanvas', slot, pageNumber, zoom, dpr }));
  }

  unmount(slot: number): void {
    this.queue.drop(slot);
    void this.client.request({ kind: 'detachCanvas', slot }).catch((error: unknown): void => {
      console.error('cdoc: detaching a page canvas failed', error);
    });
  }

  reset(): void {}
}

export class MainThreadPageRenderer implements PageRenderer {
  private readonly queue: SlotQueue = new SlotQueue();
  private readonly targets: Map<number, PaintTarget> = new Map<number, PaintTarget>();
  private rasterizer: PageRasterizer;

  constructor(
    private readonly client: CdocClient,
    private readonly port: CanvasPort,
    private readonly options: RasterizerOptions,
    private readonly targetOf: (canvas: HTMLCanvasElement) => PaintTarget,
  ) {
    this.rasterizer = new PageRasterizer(port, options);
  }

  mount(slot: number, canvas: HTMLCanvasElement): Promise<void> {
    this.targets.set(slot, this.targetOf(canvas));
    return Promise.resolve();
  }

  paint(slot: number, pageNumber: number, zoom: number, dpr: number): Promise<PaintOutcome> {
    return this.queue.run(slot, async (): Promise<PaintOutcome> => {
      const target: PaintTarget | undefined = this.targets.get(slot);
      if (target === undefined) throw new Error(`no canvas is mounted in slot ${slot}`);
      const rasterizer: PageRasterizer = this.rasterizer;
      if (!rasterizer.holds(pageNumber)) {
        const { displayList } = await this.client.request({ kind: 'paint', pages: [pageNumber] });
        rasterizer.setList(openDisplayList(displayList));
      }
      for (const [faceId, glyphIds] of rasterizer.missingGlyphs(pageNumber)) {
        const batch: GlyphPathBatch = await this.client.request({ kind: 'glyphPaths', faceId, glyphIds: glyphIds.slice() });
        rasterizer.addOutlines(faceId, glyphIds, batch.records, batch.offsets);
      }
      return rasterizer.paint(target, pageNumber, deviceScale(zoom, dpr));
    });
  }

  unmount(slot: number): void {
    this.queue.drop(slot);
    this.targets.delete(slot);
  }

  reset(): void {
    this.rasterizer = new PageRasterizer(this.port, this.options);
  }
}
