/**
 * Opening a replica from a file and exporting the live document. The engine side (cdoc-edit's
 * EditorHandle importing and exporting through the format crates) is the cdoc-edit-io release;
 * until it is vendored both fail by name rather than pretending.
 */

/** A file a replica can be opened from, by its kind (never by its extension or MIME type alone). */
export type ImportFormat = 'docx' | 'odt' | 'md' | 'txt';
export type ExportFormat = 'docx' | 'dotx' | 'odt' | 'md' | 'txt' | 'pdf';

/**
 * One loss, as the model's report spells it (cdoc_model::Loss, untagged on the wire, tagged
 * here): a counted loss, or refused macros.
 */
export type ConversionLoss =
  | { readonly kind: 'counted'; readonly part: string; readonly what: string; readonly count: number }
  | { readonly kind: 'macros'; readonly part: string; readonly bytes: bigint };

/** What a conversion could not carry; every importer and exporter returns one. */
export interface ConversionReport {
  readonly losses: readonly ConversionLoss[];
  /** The model's validation problems with an imported document. */
  readonly problems: readonly string[];
}

/** PDF records when it was written, so its target carries the time; no other format does. */
export type ExportTarget =
  | { readonly format: 'pdf'; readonly nowRfc3339: string }
  | { readonly format: Exclude<ExportFormat, 'pdf'> };

export interface ExportedFile {
  /** A buffer of its own, transferable. */
  readonly bytes: Uint8Array;
  readonly report: ConversionReport;
}

/** What an import could not carry, and whether the file was a document or a template. */
export interface ImportReport extends ConversionReport {
  readonly format: ImportFormat;
  /** DOCX and ODT only: a template (.dotx, .ott) opens as a new document from it. */
  readonly kind: 'document' | 'template' | null;
}
