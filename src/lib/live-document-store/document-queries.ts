/**
 * Read-only queries over a stored document's revision chain and provenance.
 *
 * Split from the store so it keeps creation, adoption and persistence — the
 * paths where getting it wrong loses work — and these stay beside each other as
 * plain lookups.
 */

import type { RevisionEntry } from '@/types/p2p-types';
import type { StoredDocument } from './types';

type Load = (docId: string) => Promise<StoredDocument | null>;

export async function getRevisionChain(load: Load, docId: string): Promise<RevisionEntry[]> {
  const doc: StoredDocument | null = await load(docId);
  return doc?.revisionChain ?? [];
}

export async function getRootHash(load: Load, docId: string): Promise<string | null> {
  const doc: StoredDocument | null = await load(docId);
  return doc?.metadata.rootHash ?? null;
}

export async function getCreatorCid(load: Load, docId: string): Promise<string | null> {
  const doc: StoredDocument | null = await load(docId);
  return doc?.metadata.creatorCid ?? null;
}

export async function isCreator(load: Load, docId: string, cid: string): Promise<boolean> {
  return (await getCreatorCid(load, docId)) === cid;
}
