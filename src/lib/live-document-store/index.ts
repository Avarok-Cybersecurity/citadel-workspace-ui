/**
 * Live Document Store - Barrel Export
 *
 * Re-exports ALL public exports from the module for backward compatibility.
 * Consumers import from '@/lib/live-document-store' (resolves to this file).
 */

// Types
export type { DocumentMetadata, StoredDocument } from './types';

// Service class
export { LiveDocumentStore } from './service';

// Singleton instance
import { LiveDocumentStore } from './service';
export const liveDocumentStore: LiveDocumentStore = LiveDocumentStore.getInstance();
