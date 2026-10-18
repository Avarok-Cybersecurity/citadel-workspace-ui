/**
 * Opening a replica from a file and exporting the live document. The engine side (cdoc-edit's
 * EditorHandle importing and exporting through the format crates) is the cdoc-edit-io release;
 * until it is vendored both fail by name rather than pretending.
 */

/** A file a replica can be opened from, by its kind (never by its extension or MIME type alone). */
export type ImportFormat = 'docx' | 'odt' | 'md' | 'txt';
export type ExportFormat = 'docx' | 'dotx' | 'odt' | 'md' | 'txt' | 'pdf';

/** One loss, as the model's report spells it: a counted loss, or refused macros. */
export type Loss =
  | { readonly part: string; readonly what: string; readonly count: number }
  | { readonly part: string; readonly bytes: bigint };

/** What an import could not carry, and whether the file was a document or a template. */
export interface ImportReport {
  readonly format: ImportFormat;
  /** DOCX and ODT only: a template (.dotx, .ott) opens as a new document from it. */
  readonly kind: 'document' | 'template' | null;
  readonly losses: readonly Loss[];
  /** The model's validation problems, if any survived the import. */
  readonly problems: readonly string[];
}
