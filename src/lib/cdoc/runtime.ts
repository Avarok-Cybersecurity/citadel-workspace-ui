/**
 * The Citadel Docs runtime a document view needs: the worker client and the page renderer
 * suited to this browser. Reached only through runtime-loader.ts's dynamic import, so none of
 * cdoc (glue, decoder, painter) is in the bundle until a document opens.
 */
import type { CdocClient } from './worker/cdoc-client';
import { spawnCdocWorkerClient } from './worker/spawn-worker-client';
import { MainThreadPageRenderer, WorkerPageRenderer, type PageRenderer } from './paint/page-renderer';
import { canvasTarget, domCanvasPort } from './paint/dom-canvas-port';
import { RASTERIZER_OPTIONS } from './paint/paint-config';

export interface CdocRuntime {
  readonly client: CdocClient;
  readonly renderer: PageRenderer;
}

function canTransferCanvases(): boolean {
  return typeof HTMLCanvasElement === 'function' && typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';
}

export function spawnCdocRuntime(): CdocRuntime {
  const client: CdocClient = spawnCdocWorkerClient();
  const renderer: PageRenderer = canTransferCanvases()
    ? new WorkerPageRenderer(client, (canvas: HTMLCanvasElement): OffscreenCanvas => canvas.transferControlToOffscreen())
    : new MainThreadPageRenderer(client, domCanvasPort(), RASTERIZER_OPTIONS, canvasTarget);
  return { client, renderer };
}
