/**
 * What a document view opens. Types only, so the shell can name it without loading cdoc.
 * The document-content work item adds the node's stored content as a source.
 */
export type DocumentSource =
  | { readonly kind: 'blank' }
  | { readonly kind: 'pm'; readonly pmJson: string }
  | { readonly kind: 'model'; readonly modelJson: string };
