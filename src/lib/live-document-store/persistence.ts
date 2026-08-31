/**
 * Live Document Store - Persistence
 *
 * LocalDB read/write helpers for documents and the document index.
 */

import { websocketService } from '@/lib/websocket-service';
import { stringToBytes, bytesToString } from '@/lib/utils/encoding-utils';
import { debugLog } from '@/lib/debug-config';

import { DOCUMENTS_KEY_PREFIX, DOCUMENTS_INDEX_KEY , type StoredDocument } from './types';
import { isGenuinelyAbsent } from '@/lib/storage/absence';

/**
 * Decode a value returned from LocalDB into a string.
 */
export function decodeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return bytesToString(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  throw new Error('Unexpected value type');
}

/**
 * Load a single document from LocalDB by its ID.
 */
export async function loadDocumentFromDB(docId: string): Promise<StoredDocument | null> {
  try {
    const key: string = `${DOCUMENTS_KEY_PREFIX}_${docId}`;
    const response: { value: number[]; } | null = await websocketService.sendLocalDBGet(0n, key);

    if (response?.value) {
      const valueStr: string = decodeValue(response.value);
      return JSON.parse(valueStr) as StoredDocument;
    }
  } catch (error) {
    if (isGenuinelyAbsent(error)) {
      debugLog('LiveDocumentStore', 'No stored document', docId);
    } else {
      // `null` is read upstream as "this document does not exist", which is a
      // fine answer for an absent key and a wrong one for a read that failed.
      debugLog('LiveDocumentStore', 'COULD NOT READ document; reporting it as ' +
        'missing, which it may not be:', docId, error);
    }
  }

  return null;
}

/**
 * Save a single document to LocalDB.
 */
export async function saveDocumentToDB(docId: string, doc: StoredDocument): Promise<void> {
  const key: string = `${DOCUMENTS_KEY_PREFIX}_${docId}`;
  const valueStr: string = JSON.stringify(doc);
  const valueBytes: number[] = stringToBytes(valueStr);

  await websocketService.sendLocalDBSet(0n, key, valueBytes);
}

/**
 * Load the document index (list of document IDs) from LocalDB.
 */
export async function loadIndexFromDB(): Promise<string[]> {
  const response: { value: number[]; } | null = await websocketService.sendLocalDBGet(0n, DOCUMENTS_INDEX_KEY);
  if (response?.value) {
    const indexData: string = decodeValue(response.value);
    return JSON.parse(indexData) as string[];
  }
  return [];
}

/**
 * Save the document index to LocalDB.
 */
export async function saveIndexToDB(docIds: string[]): Promise<void> {
  const valueStr: string = JSON.stringify(docIds);
  const valueBytes: number[] = stringToBytes(valueStr);
  await websocketService.sendLocalDBSet(0n, DOCUMENTS_INDEX_KEY, valueBytes);
}

/**
 * Delete a document from LocalDB.
 *
 * A real delete, as MessagePaginationStore issues. This used to WRITE an
 * empty array over the key instead -- a tombstone the backend cannot tell
 * from data. Deleted keys therefore accumulated forever, and a later read of
 * one decoded `[]` to '' and failed JSON.parse, logging the "COULD NOT READ"
 * false alarm above for a document that was deliberately removed.
 */
export async function deleteDocumentFromDB(docId: string): Promise<void> {
  const key: string = `${DOCUMENTS_KEY_PREFIX}_${docId}`;
  try {
    await websocketService.sendLocalDBDelete(0n, key);
  } catch (error) {
    // A key already absent is a deletion already done; the tombstone this
    // replaces never surfaced that case either. Real failures must surface.
    if (!isGenuinelyAbsent(error)) throw error;
  }
}
