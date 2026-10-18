/**
 * Where this device keeps decrypted copies of documents (lib/cdoc/collab/document-cache.ts),
 * and how they are removed: all of an account's on sign-out, a node's when it is deleted or
 * its log is refused to the account. Outside lib/cdoc so sign-out and the node handlers can
 * remove them without loading the editor.
 */
import { dbDelete, dbKeysWithPrefix } from '@/lib/storage-utils';

const ROOT: string = 'cdoc-collab:';
const accountPrefix = (account: bigint): string => `${ROOT}${account.toString()}:`;

export function documentCacheKey(account: bigint, nodeId: string): string {
  return `${accountPrefix(account)}${nodeId}`;
}

/** The node a key names: what follows the account, which is digits and has no colon. */
function nodeOf(key: string): string {
  const rest: string = key.slice(ROOT.length);
  return rest.slice(rest.indexOf(':') + 1);
}

async function forgetKeys(keys: readonly string[]): Promise<void> {
  for (const key of keys) await dbDelete('keyValue', key);
}

export async function forgetAccountDocuments(account: bigint): Promise<void> {
  await forgetKeys(await dbKeysWithPrefix('keyValue', accountPrefix(account)));
}

export function forgetNodeDocuments(account: bigint, nodeIds: readonly string[]): Promise<void> {
  return forgetKeys(nodeIds.map((nodeId: string): string => documentCacheKey(account, nodeId)));
}

/** A node deleted on its server is gone for every account here that held a copy of it. */
export async function forgetDeletedNodes(nodeIds: readonly string[]): Promise<void> {
  const deleted: ReadonlySet<string> = new Set<string>(nodeIds);
  await forgetKeys((await dbKeysWithPrefix('keyValue', ROOT)).filter((key: string): boolean => deleted.has(nodeOf(key))));
}
