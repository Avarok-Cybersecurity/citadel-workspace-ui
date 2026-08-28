import type { ConnectionIO } from './io';
import { SET_USER_TIMEOUT_MS } from './constants';
import { debugLog } from '@/lib/debug-config';

/**
 * Point this tab at an account, without letting a slow write stop the flow.
 *
 * `setSelectedUser` writes tab context to IndexedDB, and IndexedDB can stall —
 * an upgrade blocked by another tab, a busy agent, a private-browsing quota.
 * `handleAuthSuccess` learned this and raced the call against a timeout,
 * continuing on expiry with a comment saying why. `switchAccount`, in the next
 * file over, awaited it bare: a stalled write there meant the user pressed a
 * workspace icon and nothing happened, with the old account still on screen.
 *
 * One implementation, so the next caller inherits the lesson instead of
 * repeating the shape. The selection is also held in memory by the caller, so
 * a lost write costs the selection on the NEXT page load, not this one.
 *
 * Returns whether the write completed, for callers that want to say so.
 */
export async function selectUserWithoutBlocking(
  io: ConnectionIO,
  selection: { selectedUsername: string; selectedServerAddress: string; selectedCid?: bigint },
): Promise<boolean> {
  try {
    await Promise.race([
      io.setSelectedUser(selection),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('setSelectedUser timeout')), SET_USER_TIMEOUT_MS),
      ),
    ]);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === 'setSelectedUser timeout') {
      debugLog('ConnectionService', 'setSelectedUser timed out — continuing anyway');
      return false;
    }
    throw error;
  }
}
