/**
 * Starts the Citadel Docs worker. The one place `new Worker` is called; Vite bundles the entry
 * as its own module chunk, fetched only when a document opens.
 */
import type { CdocClient } from './cdoc-client';
import { WorkerCdocClient } from './clients';

export function spawnCdocWorkerClient(): CdocClient {
  // The options must be a static literal: Vite parses them at build time to bundle the worker
  // (a constant there fails the build). No `name`: it is cosmetic, and a `name: '…'` literal
  // reads to check-event-listeners-have-emitters as an emitted event.
  const worker: Worker = new Worker(new URL('./cdoc.worker.ts', import.meta.url), { type: 'module' });
  return new WorkerCdocClient(worker, (): void => worker.terminate());
}
