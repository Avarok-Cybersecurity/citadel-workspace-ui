import { dbGet, dbPut } from '@/lib/storage-utils';
import { instanceManager } from '@/lib/multi-instance/instance-manager';
import type { GroupConversation } from '@/types/group';
import { debugLog } from '@/lib/debug-config';

/**
 * Groups that survive a reload.
 *
 * The store was memory-only, and nothing rebuilt it: `refresh()` has no caller,
 * and `GroupListGroupsSuccess` is handled nowhere. So every reload emptied the
 * sidebar, and opening a bookmarked `/groups/:id` reported **"This group may
 * have been deleted"** and bounced to the workspace — for a group that still
 * existed, with its history still on the server, now unreachable because there
 * was no way back in.
 *
 * IndexedDB rather than localStorage, deliberately. The previous localStorage
 * attempt never once worked: member CIDs are `bigint`, `JSON.stringify` throws
 * on bigint, and the failure was swallowed by a try/catch — so every instance
 * always started from nothing. Structured clone stores bigint natively, which
 * is exactly why this project's CID rules say browser persistence belongs here.
 *
 * Keyed per account: two accounts in one browser must not inherit each other's
 * group list, the same way conversations are now scoped.
 */
const STORE = 'keyValue';

function key(): string | null {
  const own: bigint | null = instanceManager.cid;
  // Without a session there is no account to file these under, and guessing is
  // how one account inherits another's groups.
  return own ? `groups:${own.toString()}` : null;
}

export async function loadPersistedGroups(): Promise<GroupConversation[]> {
  const k: string | null = key();
  if (!k) return [];
  try {
    const stored: GroupConversation[] | undefined = await dbGet<GroupConversation[]>(STORE, k);
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    // A read failure is not "no groups" — but it is also not recoverable here,
    // and the live event stream still repopulates the list. Logged rather than
    // thrown so a storage hiccup cannot block the app from starting.
    debugLog('GroupPersistence', 'Could not read stored groups', error);
    return [];
  }
}

export async function persistGroups(groups: GroupConversation[]): Promise<void> {
  const k: string | null = key();
  if (!k) return;
  try {
    await dbPut(STORE, k, groups);
  } catch (error) {
    debugLog('GroupPersistence', 'Could not persist groups', error);
  }
}
