/**
 * The real cdoc-wasm, for tests: the vendored glue and binary, initialised from the file
 * rather than fetched, and the vendored faces read from public/fonts/cdoc (checked against the
 * manifest's sha256 exactly as the browser adapter checks them).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as glue from '../../../../vendor/cdoc/cdoc_wasm.js';
import { FONT_MANIFEST } from '../generated/font-manifest';
import { CdocEngine } from '../engine/cdoc-engine';
import type { CdocWasm } from '../engine/cdoc-wasm-api';
import type { FontFaceEntry, FontSource } from '../fonts/font-manifest';
import { CdocHost } from '../worker/cdoc-host';
import { RASTERIZER_OPTIONS } from '../paint/paint-config';
import type { CanvasPort, PaintTarget } from '../paint/canvas-port';
import { MainThreadPageRenderer, WorkerPageRenderer, type PageRenderer } from '../paint/page-renderer';
import type { CdocRuntime } from '../runtime';
import { InProcessCdocClient } from '../worker/clients';
import { recordingContext, recordingPort, recordingTarget, type Recorder, type RecordingPort, type RecordingTarget } from '../paint/__tests__/recording-canvas';
import type { FakeDecoder } from '../paint/__tests__/fake-image-decoder';
import type { Ctx2D } from '../paint/canvas-port';

const UI: string = process.cwd();
let initialised: boolean = false;

export function realWasm(): CdocWasm {
  if (!initialised) {
    glue.initSync({ module: readFileSync(join(UI, 'public/cdoc/cdoc_wasm_bg.wasm')) });
    initialised = true;
  }
  return glue;
}

export const fileFontSource: FontSource = {
  load(face: FontFaceEntry): Promise<Uint8Array> {
    const bytes: Buffer = readFileSync(join(UI, 'public/fonts/cdoc', face.file));
    const sha: string = createHash('sha256').update(bytes).digest('hex');
    if (sha !== face.sha256) return Promise.reject(new Error(`${face.file}: sha256 mismatch`));
    return Promise.resolve(new Uint8Array(bytes));
  },
};

export function realEngine(): CdocEngine {
  return new CdocEngine(realWasm(), FONT_MANIFEST, fileFontSource);
}

export function realHost(port: CanvasPort, target: (canvas: OffscreenCanvas) => PaintTarget): CdocHost {
  return new CdocHost({ engine: (): Promise<CdocEngine> => Promise.resolve(realEngine()), port, rasterizer: RASTERIZER_OPTIONS, target });
}

interface PmParagraph { type: string; attrs?: unknown; content?: unknown[] }
interface PmDoc { content: Array<{ content: PmParagraph[] }> }

/** A blank document whose body is `paragraphs` paragraphs, each holding `text`. */
export function pmWithParagraphs(paragraphs: number, text: string): string {
  const doc: PmDoc = JSON.parse(realWasm().blank_pm_json()) as PmDoc;
  const template: PmParagraph = doc.content[0].content[0];
  doc.content[0].content = Array.from({ length: paragraphs }, (): PmParagraph => ({ ...template, content: [{ type: 'text', text }] }));
  return JSON.stringify(doc);
}

/** A blank document whose one paragraph holds `text`. */
export function pmWithText(text: string): string {
  return pmWithParagraphs(1, text);
}

export interface TestRuntime extends CdocRuntime {
  /** Every page canvas the runtime painted, in mount order, with its recorded calls. */
  readonly painted: RecordingTarget[];
  /** Each overlay canvas's recorded context, created on its first paint. */
  readonly overlays: Map<HTMLCanvasElement, Recorder>;
  /** The decodes of the renderer that paints (the host's in worker mode, the page's otherwise). */
  readonly images: FakeDecoder;
}

/**
 * The production runtime minus the thread hop and the canvas: InProcessCdocClient over the real
 * host and wasm, and either renderer, painting into recording targets.
 */
export function inProcessRuntime(renderer: 'worker' | 'main-thread'): TestRuntime {
  const painted: RecordingTarget[] = [];
  const record = (): RecordingTarget => {
    const t: RecordingTarget = recordingTarget();
    painted.push(t);
    return t;
  };
  const hostPort: RecordingPort = recordingPort();
  const pagePort: RecordingPort = recordingPort();
  const client: InProcessCdocClient = new InProcessCdocClient(realHost(hostPort.port, record));
  const pages: PageRenderer = renderer === 'worker'
    ? new WorkerPageRenderer(client, (): OffscreenCanvas => ({}) as OffscreenCanvas)
    : new MainThreadPageRenderer(client, pagePort.port, RASTERIZER_OPTIONS, record);
  const overlays: Map<HTMLCanvasElement, Recorder> = new Map<HTMLCanvasElement, Recorder>();
  const overlayContext = (canvas: HTMLCanvasElement): Ctx2D => {
    let rec: Recorder | undefined = overlays.get(canvas);
    if (rec === undefined) overlays.set(canvas, (rec = recordingContext(canvas.dataset.layer ?? 'overlay')));
    return rec.ctx;
  };
  return { client, renderer: pages, painted, overlays, overlayContext, images: (renderer === 'worker' ? hostPort : pagePort).images };
}
