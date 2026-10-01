/**
 * The account settings the agent acts on while no window is open.
 *
 * When the agent hosts an account it answers read receipts, refuses strangers,
 * reports screenshots and expires old messages itself (agent 0.8.6), so it has
 * to be told what the user chose. Every field is stated here from the window's
 * own settings; nothing is left for the agent to assume.
 */
import type {
  AccountPreferences,
  PeerRetention,
  Retention as AgentRetention,
} from 'citadel-internal-service-wasm-client';
import type { PrivacySettings } from '../privacy-settings';
import type { Retention } from '../p2p/chat-advanced-settings';

export interface PreferenceSources {
  privacy: () => PrivacySettings;
  /** This chat's retention period, as the chat settings hold it. */
  retentionFor: (ownCid: bigint, peerCid: bigint) => Promise<Retention>;
  /** The peers this account has conversations with. */
  peers: () => bigint[];
}

export function toAgentRetention(retention: Retention): AgentRetention {
  return retention === 'forever' ? 'Forever' : { Days: retention };
}

export async function accountPreferences(ownCid: bigint, sources: PreferenceSources): Promise<AccountPreferences> {
  const privacy: PrivacySettings = sources.privacy();
  const retention: PeerRetention[] = await Promise.all(
    sources.peers().map(async (peer_cid: bigint): Promise<PeerRetention> => ({
      peer_cid,
      retention: toAgentRetention(await sources.retentionFor(ownCid, peer_cid)),
    })),
  );
  return {
    send_read_receipts: privacy.sendReadReceipts,
    accept_requests_from_strangers: privacy.acceptRequestsFromStrangers,
    notify_on_screenshot: privacy.notifyOnScreenshot,
    // What the in-app toast shows today: the sender and the text. The setting
    // that lets a user hide the text arrives with native notifications (mw6).
    notification_preview: 'Text',
    // Only the chats that expire: a chat absent from the list keeps everything.
    retention: retention.filter((r: PeerRetention): boolean => r.retention !== 'Forever'),
  };
}
