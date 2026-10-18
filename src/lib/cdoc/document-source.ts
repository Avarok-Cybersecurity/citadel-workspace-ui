/**
 * What a document view opens. Types only, so the shell can name it without loading cdoc.
 * The document-content work item adds the node's stored content as a source.
 */
import type { DocsImportFormat } from '../citadel-apps/docs-file-kinds';

export type DocumentSource =
  | { readonly kind: 'blank' }
  | { readonly kind: 'pm'; readonly pmJson: string }
  | { readonly kind: 'model'; readonly modelJson: string }
  /** A file's bytes, imported by `format` in the worker. Moved there as a Transferable. */
  | { readonly kind: 'file'; readonly format: DocsImportFormat; readonly bytes: Uint8Array };
