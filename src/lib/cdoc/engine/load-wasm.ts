/**
 * The browser adapters that load cdoc-wasm's two artefacts: each glue by dynamic import (its own
 * chunk) and its binary from its stable URL, compiled while it streams. The editor artefact is
 * loaded when a document opens; the PDF artefact only when a PDF is first written.
 */
import { CDOC_EDITOR_WASM_URL, CDOC_PDF_WASM_URL } from '../asset-urls';
import type { CdocWasm, PdfWasm } from './cdoc-wasm-api';

export async function loadCdocEditorWasm(): Promise<CdocWasm> {
  const glue: typeof import('../../../../vendor/cdoc/cdoc_wasm_editor.js') = await import('../../../../vendor/cdoc/cdoc_wasm_editor.js');
  await glue.default({ module_or_path: CDOC_EDITOR_WASM_URL });
  return glue;
}

export async function loadCdocPdfWasm(): Promise<PdfWasm> {
  const glue: typeof import('../../../../vendor/cdoc/cdoc_wasm_pdf.js') = await import('../../../../vendor/cdoc/cdoc_wasm_pdf.js');
  await glue.default({ module_or_path: CDOC_PDF_WASM_URL });
  return glue;
}
