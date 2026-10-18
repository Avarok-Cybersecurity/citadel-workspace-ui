/**
 * The Citadel Docs Web Worker: cdoc-wasm, the open document and the OffscreenCanvas painter,
 * off the main thread. This file is the only wiring of real adapters to the host.
 */
import { CDOC_FONT_BASE_URL } from '../asset-urls';
import { CdocEngine } from '../engine/cdoc-engine';
import { loadCdocWasm } from '../engine/load-wasm';
import { fetchFontSource } from '../fonts/fetch-font-source';
import { FONT_MANIFEST } from '../generated/font-manifest';
import { canvasTarget, domCanvasPort } from '../paint/dom-canvas-port';
import { FONT_FETCH_TIMEOUT_MS, RASTERIZER_OPTIONS } from '../paint/paint-config';
import { CdocHost, type HostReply } from './cdoc-host';
import { isCdocRequest, type CdocResponse } from './protocol';

interface WorkerScope {
  postMessage(message: CdocResponse, transfer: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}

const scope: WorkerScope = self as unknown as WorkerScope;

const host: CdocHost = new CdocHost({
  engine: async (): Promise<CdocEngine> =>
    new CdocEngine(await loadCdocWasm(), FONT_MANIFEST, fetchFontSource(CDOC_FONT_BASE_URL, FONT_FETCH_TIMEOUT_MS)),
  port: domCanvasPort(),
  rasterizer: RASTERIZER_OPTIONS,
  target: canvasTarget,
});

scope.addEventListener('message', (event: MessageEvent<unknown>): void => {
  const request: unknown = event.data;
  if (!isCdocRequest(request)) {
    console.error('cdoc worker: ignored a message that is not a protocol request');
    return;
  }
  void host.handle(request).then((reply: HostReply): void => scope.postMessage(reply.response, reply.transfer));
});
