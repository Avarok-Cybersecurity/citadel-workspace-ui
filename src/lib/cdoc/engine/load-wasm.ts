/**
 * The browser adapter that loads cdoc-wasm: the glue by dynamic import (so it is its own chunk,
 * reached only when a document opens) and the binary from its stable, precached URL, compiled
 * while it streams.
 */
import { CDOC_WASM_URL } from '../asset-urls';
import type { CdocWasm } from './cdoc-wasm-api';

export async function loadCdocWasm(): Promise<CdocWasm> {
  const glue: typeof import('../generated/cdoc_wasm.js') = await import('../generated/cdoc_wasm.js');
  await glue.default({ module_or_path: CDOC_WASM_URL });
  return glue;
}
