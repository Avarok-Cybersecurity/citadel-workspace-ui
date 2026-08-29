/**
 * Who the permissions service is asking on behalf of.
 *
 * Two sources, and they are not interchangeable. `currentConnectionInfo.username`
 * is synchronous and is what the event listeners compare against when a
 * `UserPermissions` response arrives — an async lookup there would make the
 * answer depend on listener order. It is also empty for a user who logged IN
 * rather than registering, and was being erased outright by a partial write
 * until round 300.
 *
 * The tab-selected session is the authoritative record of who is signed in
 * here, and it is IndexedDB-backed, so it can only be had asynchronously.
 *
 * When the synchronous one returns null and nothing falls back, every fetch
 * bails with "No current user" — the cache stays empty, a check against an
 * unloaded domain returns false, and EVERY gate in the app denies. A workspace's
 * own admin then sees what a stranger sees, with nothing above debug level to
 * say why.
 *
 * Its own module because it is the question four rounds of CI archaeology kept
 * coming back to, and because it can be read without the rest of the service.
 */

import { connectionManager } from '@/lib/connection';
import type { StoredSession } from '@/types/session-types';
import type { CurrentConnectionInfo } from '@/lib/connection/types';

/** The signed-in user as the connection knows them, without waiting. */
export function currentUserIdSync(): string | null {
  const connectionInfo: CurrentConnectionInfo | null = connectionManager.getConnectionInfo();
  return connectionInfo?.username || null;
}

/** The signed-in user, from whichever source actually knows. */
export async function resolveCurrentUserId(): Promise<string | null> {
  const fromConnection: string | null = currentUserIdSync();
  if (fromConnection) return fromConnection;

  const session: StoredSession | null = await connectionManager.getTabSelectedSession();
  return session?.username ?? null;
}
