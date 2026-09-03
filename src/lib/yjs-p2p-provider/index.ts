/**
 * YJS P2P Provider - Barrel Export
 *
 * Re-exports ALL public exports from the module for backward compatibility.
 * Consumers import from '@/lib/yjs-p2p-provider' (resolves to this file).
 */

import * as Y from 'yjs';
import { YjsP2PProvider } from './provider';

// Main provider class
export { YjsP2PProvider } from './provider';

// Types (re-export for consumers that may need them)
export type { SyncState } from './types';

/**
 * Create a Yjs P2P provider for a document
 */
export function createYjsP2PProvider(
  documentId: string,
  peerCid: string,
  ownCid: string | null,
  doc?: Y.Doc,
  creatorCid?: string | null
): YjsP2PProvider {
  const ydoc: Y.Doc = doc || new Y.Doc();
  return new YjsP2PProvider(documentId, peerCid, ydoc, ownCid, creatorCid ?? null);
}
