/**
 * The one seam for what this device keeps of an account's workspace in IndexedDB: decrypted
 * document copies (lib/cdoc/collab/document-cache.ts), each document's unacknowledged local
 * edits and per-device choices, and the last-known workspace tree. Every read, write and
 * removal of the `cdoc-collab:` family goes through here, so one layer (encryption at rest,
 * when it is decided) covers all of them. Outside lib/cdoc so sign-out and the node handlers
 * can remove copies without loading the editor.
 *
 * Keys, all under `cdoc-collab:<account>:`, with `#` reserved (a node id is a uuid):
 *   `<node>`                    the document's base copy (snapshot and seq)
 *   `<node>#edits:<instance>`   one tab instance's edits the server has not acknowledged
 *   `<node>#device`             this device's choices for the document
 *   `<node>#access`             the account's last answer to "may I edit it?", for offline
 *   `#tree`                     the last-known workspace tree (no node: deletion never matches it)
 */
import { dbDelete, dbGet, dbKeysWithPrefix, dbPut } from '@/lib/storage-utils';
import { readCachedTree, type CachedWorkspaceTree } from '@/lib/offline-tree';

const ROOT: string = 'cdoc-collab:';
const RESERVED: string = '#';
const accountPrefix = (account: bigint): string => `${ROOT}${account.toString()}:`;

/** A node id names a node: it is not empty and holds no `#`. Ids are the server's, so data. */
const isNodeId = (nodeId: string): boolean => nodeId.length > 0 && !nodeId.includes(RESERVED);

function nodeKey(account: bigint, nodeId: string): string {
  if (!isNodeId(nodeId)) throw new Error(`not a node id: "${nodeId}"`);
  return `${accountPrefix(account)}${nodeId}`;
}

export const documentCacheKey = (account: bigint, nodeId: string): string => nodeKey(account, nodeId);
export const documentEditsPrefix = (account: bigint, nodeId: string): string => `${nodeKey(account, nodeId)}${RESERVED}edits:`;
export const documentEditsKey = (account: bigint, nodeId: string, instance: string): string => `${documentEditsPrefix(account, nodeId)}${instance}`;
export const documentDeviceKey = (account: bigint, nodeId: string): string => `${nodeKey(account, nodeId)}${RESERVED}device`;
export const documentAccessKey = (account: bigint, nodeId: string): string => `${nodeKey(account, nodeId)}${RESERVED}access`;
export const workspaceTreeKey = (account: bigint): string => `${accountPrefix(account)}${RESERVED}tree`;

export const localRecordGet = (key: string): Promise<unknown> => dbGet<unknown>('keyValue', key);
export const localRecordPut = (key: string, value: unknown): Promise<void> => dbPut('keyValue', key, value);
export const localRecordRemove = (key: string): Promise<void> => dbDelete('keyValue', key);

export async function localRecordsWithPrefix(prefix: string): Promise<{ readonly key: string; readonly value: unknown }[]> {
  const records: { readonly key: string; readonly value: unknown }[] = [];
  for (const key of await dbKeysWithPrefix('keyValue', prefix)) records.push({ key, value: await localRecordGet(key) });
  return records;
}

/** The node a key is about: what follows the account (digits, no colon) up to `#`; '' for `#tree`. */
function nodeOf(key: string): string {
  const rest: string = key.slice(ROOT.length);
  const record: string = rest.slice(rest.indexOf(':') + 1);
  const reserved: number = record.indexOf(RESERVED);
  return reserved < 0 ? record : record.slice(0, reserved);
}

async function forgetKeys(keys: readonly string[]): Promise<void> {
  for (const key of keys) await localRecordRemove(key);
}

/** The documents this account has edits held of on this device (sent by no tab yet). */
export async function documentsWithHeldEdits(account: bigint): Promise<string[]> {
  const held: Set<string> = new Set<string>();
  for (const key of await dbKeysWithPrefix('keyValue', accountPrefix(account))) {
    if (key.includes(`${RESERVED}edits:`)) held.add(nodeOf(key));
  }
  return [...held];
}

/** Sign-out: every record of the account, documents, edits, choices and tree. */
export async function forgetAccountDocuments(account: bigint): Promise<void> {
  await forgetKeys(await dbKeysWithPrefix('keyValue', accountPrefix(account)));
}

/** Every record about these nodes for one account: the copy, its edits and its choices. */
export async function forgetNodeDocuments(account: bigint, nodeIds: readonly string[]): Promise<void> {
  // An id that is no node's ('', '#tree') would match the tree's record, never a document's.
  const nodes: ReadonlySet<string> = new Set<string>(nodeIds.filter(isNodeId));
  await forgetKeys((await dbKeysWithPrefix('keyValue', accountPrefix(account))).filter((key: string): boolean => nodes.has(nodeOf(key))));
}

/** A node deleted on its server is gone for every account here that held a copy of it. */
export async function forgetDeletedNodes(nodeIds: readonly string[]): Promise<void> {
  const deleted: ReadonlySet<string> = new Set<string>(nodeIds.filter(isNodeId));
  await forgetKeys((await dbKeysWithPrefix('keyValue', ROOT)).filter((key: string): boolean => deleted.has(nodeOf(key))));
}

/** The account's last-known workspace tree (lib/offline-tree.ts), or null when none is kept. */
export async function loadWorkspaceTree(account: bigint): Promise<CachedWorkspaceTree | null> {
  return readCachedTree(await localRecordGet(workspaceTreeKey(account)));
}

export const saveWorkspaceTree = (account: bigint, tree: CachedWorkspaceTree): Promise<void> => localRecordPut(workspaceTreeKey(account), tree);
