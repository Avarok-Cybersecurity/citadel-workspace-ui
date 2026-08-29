/**
 * Server Auto-Connect Service - Persistence
 *
 * LocalDB load/save for enabled setting and user-disconnected sessions.
 */

import { websocketService } from '@/lib/websocket-service';
import { stringToBytes, bytesToString } from '@/lib/utils/encoding-utils';
import { debugLog } from '@/lib/debug-config';
import { isGenuinelyAbsent } from '@/lib/storage/absence';
import { GLOBAL_CID, LOCALDB_KEY, USER_DISCONNECTED_KEY } from './types';

/**
 * Load the enabled setting from LocalDB.
 *
 * Absent means nobody has chosen yet, and `true` is the documented default.
 * A FAILED read means nothing at all -- and returning the default there is how
 * a user who turned auto-connect off finds it back on after one timed-out
 * request. The two were one `catch` returning `true`, and the absent case fires
 * on every first boot, so the log line was permanent noise that nobody could
 * have read a real failure out of.
 */
export async function loadEnabledSetting(): Promise<boolean> {
  try {
    const result: { value: number[]; } | null = await websocketService.sendLocalDBGet(GLOBAL_CID, LOCALDB_KEY);
    if (result?.value) {
      const decoded: string = bytesToString(result.value);
      return decoded === 'true';
    }
  } catch (error) {
    if (isGenuinelyAbsent(error)) {
      debugLog('ServerAutoConnectService', 'No stored preference; auto-connect defaults to on');
    } else {
      debugLog('ServerAutoConnectService', 'COULD NOT READ the auto-connect preference; ' +
        'defaulting to on, which may not be what this user chose:', error);
    }
  }
  return true;
}

/**
 * Save the enabled setting to LocalDB.
 */
export async function saveEnabledSetting(enabled: boolean): Promise<void> {
  const value: number[] = stringToBytes(String(enabled));
  await websocketService.sendLocalDBSet(GLOBAL_CID, LOCALDB_KEY, value);
  debugLog('ServerAutoConnectService', `Setting saved (enabled: ${enabled})`);
}

/**
 * Load user-disconnected sessions from LocalDB.
 * These are sessions the user explicitly signed out from.
 */
export async function loadUserDisconnectedSessions(): Promise<Set<string>> {
  try {
    const result: { value: number[]; } | null = await websocketService.sendLocalDBGet(GLOBAL_CID, USER_DISCONNECTED_KEY);
    if (result?.value) {
      const decoded: string = bytesToString(result.value);
      const sessions = JSON.parse(decoded);
      if (Array.isArray(sessions)) {
        debugLog('ServerAutoConnectService', `Loaded ${sessions.length} user-disconnected sessions from LocalDB`);
        return new Set(sessions);
      }
    }
  } catch (error) {
    if (isGenuinelyAbsent(error)) {
      debugLog('ServerAutoConnectService', 'No user-disconnected sessions stored yet');
    } else {
      // An empty set here means "nobody signed out of anything", which is what
      // makes the service reconnect them. Say so, rather than logging a generic
      // failure beside the one that happens on every first boot.
      debugLog('ServerAutoConnectService', 'COULD NOT READ user-disconnected sessions; ' +
        'treating every session as reconnectable:', error);
    }
  }
  return new Set();
}

/**
 * Persist user-disconnected sessions to LocalDB.
 */
export async function persistUserDisconnectedSessions(sessions: Set<string>): Promise<void> {
  try {
    const value: number[] = stringToBytes(JSON.stringify(Array.from(sessions)));
    await websocketService.sendLocalDBSet(GLOBAL_CID, USER_DISCONNECTED_KEY, value);
  } catch (error) {
    debugLog('ServerAutoConnectService', 'Failed to persist user disconnected sessions:', error);
  }
}
