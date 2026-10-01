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
  NotificationPreview,
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

/**
 * `preview` is the account's notification preview, which only the agent keeps
 * (per account, SenderOnly until the user turns previews on): passed through,
 * so a push of the window's other settings never resets it.
 */
export async function accountPreferences(
  ownCid: bigint,
  sources: PreferenceSources,
  preview: NotificationPreview,
): Promise<AccountPreferences> {
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
    notification_preview: preview,
    // Only the chats that expire: a chat absent from the list keeps everything.
    retention: retention.filter((r: PeerRetention): boolean => r.retention !== 'Forever'),
  };
}
