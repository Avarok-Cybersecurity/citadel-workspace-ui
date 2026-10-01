/**
 * What the agent is told about the account: the user's own choices, field for
 * field, and only the chats that expire.
 */
import { describe, it, expect } from 'vitest';
import type { AccountPreferences } from 'citadel-internal-service-wasm-client';
import { accountPreferences, toAgentRetention } from '../preferences';
import { DEFAULT_PRIVACY_SETTINGS, type PrivacySettings } from '../../privacy-settings';
import type { Retention } from '../../p2p/chat-advanced-settings';

const ME: bigint = 1n;

describe('the account preferences pushed to the agent', () => {
  it('states every privacy choice as the user made it', async () => {
    const privacy: PrivacySettings = { ...DEFAULT_PRIVACY_SETTINGS, sendReadReceipts: false, acceptRequestsFromStrangers: false, notifyOnScreenshot: true };
    const prefs: AccountPreferences = await accountPreferences(ME, { privacy: () => privacy, retentionFor: async () => 'forever', peers: () => [] });
    expect(prefs).toEqual({
      send_read_receipts: false,
      accept_requests_from_strangers: false,
      notify_on_screenshot: true,
      notification_preview: 'Text',
      retention: [],
    });
  });

  it('lists each chat that expires with its period, and leaves out the ones kept for ever', async () => {
    const periods: Map<bigint, Retention> = new Map<bigint, Retention>([[2n, 7], [3n, 'forever'], [4n, 365]]);
    const prefs: AccountPreferences = await accountPreferences(ME, {
      privacy: () => DEFAULT_PRIVACY_SETTINGS,
      retentionFor: async (_own: bigint, peer: bigint) => periods.get(peer) ?? 'forever',
      peers: () => [2n, 3n, 4n],
    });
    expect(prefs.retention).toEqual([
      { peer_cid: 2n, retention: { Days: 7 } },
      { peer_cid: 4n, retention: { Days: 365 } },
    ]);
  });

  it('names retention the way the agent does', () => {
    expect(toAgentRetention('forever')).toBe('Forever');
    expect(toAgentRetention(30)).toEqual({ Days: 30 });
  });
});
