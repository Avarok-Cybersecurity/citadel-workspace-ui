/**
 * The event the workspace response handler emits for every `Documents` response this tab
 * receives, and cdoc/collab/documents-transport.ts listens to. Kept free of imports beyond the type, so
 * the response handler takes nothing else from the collaboration code.
 */
import type { DocumentsResponse } from 'citadel-workspace-client-ts';

export const DOCUMENTS_EVENT: 'workspace:documents' = 'workspace:documents';

export interface DocumentsEvent {
  readonly answer: DocumentsResponse;
}
