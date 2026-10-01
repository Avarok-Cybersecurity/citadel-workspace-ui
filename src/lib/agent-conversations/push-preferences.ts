/**
 * Telling the agent the account's settings (see preferences.ts for which).
 *
 * Pushed when this window's conversations load for an account the agent hosts,
 * when the privacy settings are saved, and when a chat's retention changes --
 * every moment the agent's copy could differ from what the user chose.
 */
import { accountPreferences } from './preferences';
import { agentConversations } from './requests';
import { getPrivacySettings } from '../privacy-settings';
import { chatAdvancedSettings, type Retention } from '../p2p/chat-advanced-settings';

export async function pushAccountPreferences(ownCid: bigint, peers: () => bigint[]): Promise<void> {
  await agentConversations.setPreferences(ownCid, await accountPreferences(ownCid, {
    privacy: getPrivacySettings,
    retentionFor: async (own: bigint, peer: bigint): Promise<Retention> => (await chatAdvancedSettings.get(own, peer)).retention,
    peers,
  }));
}
