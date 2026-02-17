/**
 * CID Resolver
 *
 * Resolves the current CID with proper priority for multi-tab support.
 * Extracted to avoid duplication across service methods.
 */

import { connectionManager } from '../connection';
import { instanceManager } from '../multi-instance';
import { getSelectedUser } from '../tab-context';
import { CID_LOOKUP_TIMEOUT_MS } from './constants';

/**
 * Get current CID with proper priority for multi-tab support:
 * 1) InstanceManager CID (FIRST - synchronous, set by handleSuccessfulConnection)
 * 2) Tab context selectedCid (IndexedDB - may hang on follower tabs)
 * 3) StoredSession.cid (IndexedDB - may hang on follower tabs)
 * 4) Global connection CID (legacy fallback)
 *
 * CRITICAL: InstanceManager.cid is checked FIRST because:
 * - It's set synchronously in handleSuccessfulConnection (no async delays)
 * - IndexedDB reads can hang indefinitely on follower tabs due to contention
 * - For multi-tab scenarios, instanceManager is the reliable source of truth
 */
export async function getCurrentCid(): Promise<bigint | null> {
  // 1) InstanceManager CID FIRST (bypasses IndexedDB, synchronous)
  const instanceCid = instanceManager.cid;
  if (instanceCid) {
    return instanceCid;
  }

  // 2) Tab context from IndexedDB (with timeout to prevent hangs)
  try {
    const tabSelectionPromise = getSelectedUser();
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CID_LOOKUP_TIMEOUT_MS));
    const tabSelection = await Promise.race([tabSelectionPromise, timeout]);
    if (tabSelection?.selectedCid) {
      return tabSelection.selectedCid;
    }
  } catch {
    // Ignore timeout/errors
  }

  // 3) Tab session from stored sessions (with timeout)
  try {
    const tabSessionPromise = connectionManager.getTabSelectedSession();
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CID_LOOKUP_TIMEOUT_MS));
    const tabSession = await Promise.race([tabSessionPromise, timeout]);
    if (tabSession?.cid) {
      return tabSession.cid;
    }
  } catch {
    // Ignore timeout/errors
  }

  // 4) Legacy global connection CID
  const connectionInfo = connectionManager.getConnectionInfo();
  return connectionInfo?.cid || null;
}
