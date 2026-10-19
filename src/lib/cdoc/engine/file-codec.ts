/**
 * Files in and out of Citadel Docs: the only module that calls cdoc-wasm's importers and
 * exporters, so the format table, the options each takes and the report each returns live in
 * one place. DOCX and DOTX share the package reader (the file says which it is) and writer
 * (`{"kind": "document" | "template"}`); macros in a Word file are refused by the reader and
 * reported, which is how the engine refuses to open it (cdoc-engine.ts).
 */
import type { DocsImportFormat } from '../../citadel-apps/docs-file-kinds';
import { NOT_CONVERTED, readConversionReport } from '../conversion-report';
import type { DocumentSource } from '../document-source';
import type { ConversionReport, ExportedFile } from '../editor/file-formats';
import type { CdocWasm, FileExport, ImageStore } from './cdoc-wasm-api';
import type { DocumentExportTarget } from './editor-files';
import { MD_READ_OPTIONS, PACKAGE_READ_OPTIONS, TXT_READ_OPTIONS } from './engine-limits';

export interface ImportedFile {
  readonly pmJson: string;
  readonly report: ConversionReport;
  /** The images the file embedded, under the ids its document names. */
  readonly images: ImageStore;
}

const UTF8: TextDecoder = new TextDecoder('utf-8', { fatal: true });

function decodeText(bytes: Uint8Array, format: string): string {
  try {
    return UTF8.decode(bytes);
  } catch {
    throw new Error(`this .${format} file is not UTF-8 text`);
  }
}

function imported(json: string, images: ImageStore): ImportedFile {
  const parsed: { pm?: unknown; report?: unknown; problems?: unknown } = JSON.parse(json) as { pm?: unknown; report?: unknown; problems?: unknown };
  if (typeof parsed.pm !== 'object' || parsed.pm === null) throw new Error('the engine returned an import without a document');
  return { pmJson: JSON.stringify(parsed.pm), report: readConversionReport(parsed.report, parsed.problems), images };
}

export function importFile(wasm: CdocWasm, format: DocsImportFormat, bytes: Uint8Array): ImportedFile {
  const images: ImageStore = new wasm.ImageStore();
  try {
    switch (format) {
      case 'docx':
      case 'dotx': return imported(wasm.docx_to_pm(bytes, images, JSON.stringify(PACKAGE_READ_OPTIONS)), images);
      case 'odt': return imported(wasm.odt_to_pm(bytes, images, JSON.stringify(PACKAGE_READ_OPTIONS)), images);
      case 'md': return imported(wasm.md_to_pm(decodeText(bytes, format), JSON.stringify(MD_READ_OPTIONS)), images);
      case 'txt': return imported(wasm.txt_to_pm(decodeText(bytes, format), JSON.stringify(TXT_READ_OPTIONS)), images);
    }
  } catch (error: unknown) {
    images.free();
    throw error;
  }
}

/** What a document view opens, as the document and images to lay out; only a file was converted. */
export function resolveSource(wasm: CdocWasm, source: DocumentSource): ImportedFile {
  switch (source.kind) {
    case 'blank': return { pmJson: wasm.blank_pm_json(), report: NOT_CONVERTED, images: new wasm.ImageStore() };
    case 'pm': return { pmJson: source.pmJson, report: NOT_CONVERTED, images: new wasm.ImageStore() };
    case 'model': return { pmJson: wasm.model_to_pm(source.modelJson), report: NOT_CONVERTED, images: new wasm.ImageStore() };
    case 'file': return importFile(wasm, source.format, source.bytes);
  }
}

function textExport(json: string): ExportedFile {
  const parsed: { text?: unknown; report?: unknown } = JSON.parse(json) as { text?: unknown; report?: unknown };
  if (typeof parsed.text !== 'string') throw new Error('the engine returned a text export without text');
  return { bytes: new TextEncoder().encode(parsed.text), report: readConversionReport(parsed.report, []) };
}

/** The package writers' options: a DOTX is a DOCX written as a template. */
const PACKAGE_DOCUMENT: string = JSON.stringify({ kind: 'document' });
const PACKAGE_TEMPLATE: string = JSON.stringify({ kind: 'template' });

function packageExport(out: FileExport): ExportedFile {
  try {
    return { bytes: out.bytes(), report: readConversionReport(JSON.parse(out.reportJson()) as unknown, []) };
  } finally {
    out.free();
  }
}

/** Every format the editor artefact writes; a PDF is the PDF artefact's (PdfWriter). */
export function exportFile(wasm: CdocWasm, target: DocumentExportTarget, pmJson: string, images: ImageStore): ExportedFile {
  switch (target.format) {
    case 'docx': return packageExport(wasm.pm_to_docx(pmJson, images, PACKAGE_DOCUMENT));
    case 'dotx': return packageExport(wasm.pm_to_docx(pmJson, images, PACKAGE_TEMPLATE));
    case 'odt': return packageExport(wasm.pm_to_odt(pmJson, images, PACKAGE_DOCUMENT));
    case 'md': return textExport(wasm.pm_to_md(pmJson));
    case 'txt': return textExport(wasm.pm_to_txt(pmJson));
  }
}
