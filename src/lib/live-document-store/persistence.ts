/**
 * Live Document Store - Persistence
 *
 * LocalDB read/write helpers for documents and the document index.
 */

import { websocketService } from '@/lib/websocket-service';
import { stringToBytes, bytesToString } from '@/lib/utils/encoding-utils';
import { debugLog } from '@/lib/debug-config';

import { DOCUMENTS_KEY_PREFIX, DOCUMENTS_INDEX_KEY } from './types';
import type { StoredDocument } from './types';

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
    const key = `${DOCUMENTS_KEY_PREFIX}_${docId}`;
    const response = await websocketService.sendLocalDBGet(0n, key);

    if (response?.value) {
      const valueStr = decodeValue(response.value);
      return JSON.parse(valueStr) as StoredDocument;
    }
  } catch (error) {
    debugLog('LiveDocumentStore', 'Failed to load document:', docId, error);
  }

  return null;
}

/**
 * Save a single document to LocalDB.
 */
export async function saveDocumentToDB(docId: string, doc: StoredDocument): Promise<void> {
  const key = `${DOCUMENTS_KEY_PREFIX}_${docId}`;
  const valueStr = JSON.stringify(doc);
  const valueBytes = stringToBytes(valueStr);

  await websocketService.sendLocalDBSet(0n, key, valueBytes);
}

/**
 * Load the document index (list of document IDs) from LocalDB.
 */
export async function loadIndexFromDB(): Promise<string[]> {
  const response = await websocketService.sendLocalDBGet(0n, DOCUMENTS_INDEX_KEY);
  if (response?.value) {
    const indexData = decodeValue(response.value);
    return JSON.parse(indexData) as string[];
  }
  return [];
}

/**
 * Save the document index to LocalDB.
 */
export async function saveIndexToDB(docIds: string[]): Promise<void> {
  const valueStr = JSON.stringify(docIds);
  const valueBytes = stringToBytes(valueStr);
  await websocketService.sendLocalDBSet(0n, DOCUMENTS_INDEX_KEY, valueBytes);
}

/**
 * Delete a document from LocalDB (sets value to empty array).
 */
export async function deleteDocumentFromDB(docId: string): Promise<void> {
  const key = `${DOCUMENTS_KEY_PREFIX}_${docId}`;
  await websocketService.sendLocalDBSet(0n, key, []);
}
