/**
 * Server Auto-Connect Service - Persistence
 *
 * LocalDB load/save for enabled setting and user-disconnected sessions.
 */

import { websocketService } from '@/lib/websocket-service';
import { stringToBytes, bytesToString } from '@/lib/utils/encoding-utils';
import { debugLog } from '@/lib/debug-config';
import { GLOBAL_CID, LOCALDB_KEY, USER_DISCONNECTED_KEY } from './types';

/**
 * Load the enabled setting from LocalDB.
 * Returns true (default) if not found or on error.
 */
export async function loadEnabledSetting(): Promise<boolean> {
  try {
    const result = await websocketService.sendLocalDBGet(GLOBAL_CID, LOCALDB_KEY);
    if (result?.value) {
      const decoded = bytesToString(result.value);
      return decoded === 'true';
    }
  } catch (error) {
    debugLog('ServerAutoConnectService', 'Failed to load enabled setting:', error);
  }
  return true;
}

/**
 * Save the enabled setting to LocalDB.
 */
export async function saveEnabledSetting(enabled: boolean): Promise<void> {
  const value = stringToBytes(String(enabled));
  await websocketService.sendLocalDBSet(GLOBAL_CID, LOCALDB_KEY, value);
  debugLog('ServerAutoConnectService', `Setting saved (enabled: ${enabled})`);
}

/**
 * Load user-disconnected sessions from LocalDB.
 * These are sessions the user explicitly signed out from.
 */
export async function loadUserDisconnectedSessions(): Promise<Set<string>> {
  try {
    const result = await websocketService.sendLocalDBGet(GLOBAL_CID, USER_DISCONNECTED_KEY);
    if (result?.value) {
      const decoded = bytesToString(result.value);
      const sessions = JSON.parse(decoded);
      if (Array.isArray(sessions)) {
        debugLog('ServerAutoConnectService', `Loaded ${sessions.length} user-disconnected sessions from LocalDB`);
        return new Set(sessions);
      }
    }
  } catch (error) {
    debugLog('ServerAutoConnectService', 'Failed to load user disconnected sessions:', error);
  }
  return new Set();
}

/**
 * Persist user-disconnected sessions to LocalDB.
 */
export async function persistUserDisconnectedSessions(sessions: Set<string>): Promise<void> {
  try {
    const value = stringToBytes(JSON.stringify(Array.from(sessions)));
    await websocketService.sendLocalDBSet(GLOBAL_CID, USER_DISCONNECTED_KEY, value);
  } catch (error) {
    debugLog('ServerAutoConnectService', 'Failed to persist user disconnected sessions:', error);
  }
}
