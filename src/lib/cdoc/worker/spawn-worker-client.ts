/**
 * Starts the Citadel Docs worker. The one place `new Worker` is called; Vite bundles the entry
 * as its own module chunk, fetched only when a document opens.
 */
import type { CdocClient } from './cdoc-client';
import { WorkerCdocClient } from './clients';

/** The worker's name in devtools and task managers. */
const WORKER_NAME: string = 'citadel-docs';

export function spawnCdocWorkerClient(): CdocClient {
  const worker: Worker = new Worker(new URL('./cdoc.worker.ts', import.meta.url), { type: 'module', name: WORKER_NAME });
  return new WorkerCdocClient(worker, (): void => worker.terminate());
}
