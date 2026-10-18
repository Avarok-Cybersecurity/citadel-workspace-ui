/**
 * The worker side of the protocol: answers each request from the engine, and paints attached
 * OffscreenCanvases itself (outlines come straight from cdoc-wasm here, no round trip). The
 * worker entry and InProcessCdocClient both run exactly this class.
 */
import type { CdocEngine } from '../engine/cdoc-engine';
import type { DisplayList } from '../display-list/types';
import type { CanvasPort, PaintTarget } from '../paint/canvas-port';
import { PageRasterizer, type RasterizerOptions } from '../paint/page-rasterizer';
import { deviceScale } from '../paint/units';
import { transferablesOf, type CdocKind, type CdocRequest, type CdocResponse, type CdocResults } from './protocol';

export interface CdocHostDeps {
  /** Called once, on the first request that needs the engine. */
  readonly engine: () => Promise<CdocEngine>;
  readonly port: CanvasPort;
  readonly rasterizer: RasterizerOptions;
  readonly target: (canvas: OffscreenCanvas) => PaintTarget;
}

export interface HostReply {
  readonly response: CdocResponse;
  readonly transfer: Transferable[];
}

export class CdocHost {
  private engine: Promise<CdocEngine> | null = null;
  private readonly canvases: Map<number, PaintTarget> = new Map<number, PaintTarget>();
  private painter: PageRasterizer;
  private paintedList: DisplayList | null = null;

  constructor(private readonly deps: CdocHostDeps) {
    this.painter = new PageRasterizer(deps.port, deps.rasterizer);
  }

  private getEngine(): Promise<CdocEngine> {
    this.engine ??= this.deps.engine();
    return this.engine;
  }

  private async result(req: CdocRequest): Promise<CdocResults[CdocKind]> {
    const engine: CdocEngine = await this.getEngine();
    switch (req.kind) {
      case 'open': return engine.open(req.source);
      case 'paint': return { displayList: engine.paint(req.pages) };
      case 'glyphPaths': return engine.glyphPaths(req.faceId, req.glyphIds);
      case 'faceMetrics': return { metrics: engine.faceMetrics(req.faceId) };
      case 'attachCanvas':
        this.canvases.set(req.slot, this.deps.target(req.canvas));
        return { slot: req.slot };
      case 'detachCanvas':
        this.canvases.delete(req.slot);
        return { slot: req.slot };
      case 'paintCanvas': {
        const target: PaintTarget | undefined = this.canvases.get(req.slot);
        if (target === undefined) throw new Error(`no canvas is attached in slot ${req.slot}`);
        if (this.paintedList !== engine.list) {
          // Face ids are per document: outlines and atlas cells of the last one do not carry over.
          this.paintedList = engine.list;
          this.painter = new PageRasterizer(this.deps.port, this.deps.rasterizer);
          this.painter.setList(engine.list);
        }
        for (const [faceId, glyphIds] of this.painter.missingGlyphs(req.pageNumber)) {
          const batch: ReturnType<CdocEngine['glyphPaths']> = engine.glyphPaths(faceId, glyphIds);
          this.painter.addOutlines(faceId, glyphIds, batch.records, batch.offsets);
        }
        return this.painter.paint(target, req.pageNumber, deviceScale(req.zoom, req.dpr));
      }
    }
  }

  async handle(req: CdocRequest): Promise<HostReply> {
    try {
      const result: CdocResults[CdocKind] = await this.result(req);
      return { response: { id: req.id, ok: true, result }, transfer: transferablesOf(result) };
    } catch (error: unknown) {
      return { response: { id: req.id, ok: false, error: error instanceof Error ? error.message : String(error) }, transfer: [] };
    }
  }
}
