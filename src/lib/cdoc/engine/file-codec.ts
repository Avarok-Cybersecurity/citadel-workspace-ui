/**
 * Files in and out of Citadel Docs: the only module that calls cdoc-wasm's importers and
 * exporters, so the format table, the options each takes and the report each returns live in
 * one place. DOCX and DOTX share the package reader (the file says which it is) and writer
 * (`{"kind": "document" | "template"}`); macros in a Word file are refused by the reader and
 * reported, which is how the engine refuses to open it (cdoc-engine.ts).
 */
import type { DocsImportFormat } from '../../citadel-apps/docs-file-kinds';
import { readConversionReport } from '../conversion-report';
import type { ConversionReport, ExportedFile, ExportTarget } from '../editor/file-formats';
import type { CdocWasm, FileExport, ImageStore, RenderAssets } from './cdoc-wasm-api';

/** What a missing cdoc-wasm export would have done, named so the gap is visible. */
export class CdocEngineGap extends Error {
  constructor(readonly missing: string, what: string) {
    super(`${what} needs cdoc-wasm's ${missing}, which this build of Citadel Docs does not have yet`);
    this.name = 'CdocEngineGap';
  }
}

/**
 * Markdown import options, Pt100 (cdoc_md::MdReadOptions; every field required). The text
 * width is the blank document's: A4 (59530) less two 1-inch margins (7200 each). An image with
 * no size is given the text width and a 4:3 height.
 */
export const MD_READ_OPTIONS: { readonly textWidth: number; readonly imageWidth: number; readonly imageHeight: number } = {
  textWidth: 45130,
  imageWidth: 45130,
  imageHeight: 33848,
};

/** Plain-text import: a single newline is a line break, a blank line a new paragraph. */
export const TXT_READ_OPTIONS: { readonly singleNewline: 'break' | 'space' } = { singleNewline: 'break' };

export interface ImportedFile {
  readonly pmJson: string;
  readonly report: ConversionReport;
  /** The images the file embedded, under the ids its document names. */
  readonly images: ImageStore;
}

/** pm_to_pdf returns no report: a PDF is the laid-out pages, which carry what the page view draws. */
const PDF_REPORTS_NOTHING: ConversionReport = { losses: [], problems: [] };

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
      case 'dotx': return imported(wasm.docx_to_pm(bytes, images), images);
      case 'odt': return imported(wasm.odt_to_pm(bytes, images), images);
      case 'md': return imported(wasm.md_to_pm(decodeText(bytes, format), JSON.stringify(MD_READ_OPTIONS)), images);
      case 'txt': return imported(wasm.txt_to_pm(decodeText(bytes, format), JSON.stringify(TXT_READ_OPTIONS)), images);
    }
  } catch (error: unknown) {
    images.free();
    throw error;
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

/** `pdfAssets` builds the faces and images a PDF is set in, stamped with its time; it is freed here. */
export function exportFile(wasm: CdocWasm, target: ExportTarget, pmJson: string, images: ImageStore, pdfAssets: (nowRfc3339: string) => RenderAssets): ExportedFile {
  switch (target.format) {
    case 'docx': return packageExport(wasm.pm_to_docx(pmJson, images, PACKAGE_DOCUMENT));
    case 'dotx': return packageExport(wasm.pm_to_docx(pmJson, images, PACKAGE_TEMPLATE));
    case 'odt': return packageExport(wasm.pm_to_odt(pmJson, images, PACKAGE_DOCUMENT));
    case 'md': return textExport(wasm.pm_to_md(pmJson));
    case 'txt': return textExport(wasm.pm_to_txt(pmJson));
    case 'pdf': {
      const assets: RenderAssets = pdfAssets(target.nowRfc3339);
      try {
        return { bytes: wasm.pm_to_pdf(pmJson, assets), report: PDF_REPORTS_NOTHING };
      } finally {
        assets.free();
      }
    }
  }
}
