/**
 * Privacy settings have to reach the code that must obey them.
 *
 * All six lived inside PrivacySettingsTab, which wrote them to localStorage and
 * dispatched an event nothing subscribed to. No field was read anywhere outside
 * the tab that wrote it — so on a product built around the user controlling
 * their own data, "Send read receipts: off" still sent receipts.
 *
 * These assert at the send points, which is where the promise is kept or broken.
 */
import { describe, it, expect, vi, beforeEach  } from 'vitest';
import type { PrivacySettings } from '@/lib/privacy-settings';
import {
  DEFAULT_PRIVACY_SETTINGS,
  PRIVACY_ENFORCEMENT,
  savePrivacySettings,
  getPrivacySettings,
} from '../privacy-settings';

beforeEach(() => {
  localStorage.clear();
  savePrivacySettings(DEFAULT_PRIVACY_SETTINGS);
});

describe('privacy settings storage', () => {
  it('keeps a saved choice and answers with it', () => {
    savePrivacySettings({ ...DEFAULT_PRIVACY_SETTINGS, showOnlineStatus: false });
    expect(getPrivacySettings().showOnlineStatus).toBe(false);
  });

  it('fills in fields an older build never saved', async () => {
    // What a user who saved before these fields existed has on disk today.
    // `undefined` reads as "off" for a boolean, which would silently answer a
    // privacy question they were never asked. Same class as the file-transfer
    // settings merge.
    localStorage.setItem(
      'citadel:privacy-settings',
      JSON.stringify({ showOnlineStatus: false }),
    );
    // A fresh module instance, so nothing is cached from an earlier write.
    vi.resetModules();
    const fresh = await import('../privacy-settings');

    const read: PrivacySettings = fresh.getPrivacySettings();
    expect(read.showOnlineStatus).toBe(false);
    expect(read.sendReadReceipts).toBe(DEFAULT_PRIVACY_SETTINGS.sendReadReceipts);
    expect(read.allowDirectMessages).toBe(DEFAULT_PRIVACY_SETTINGS.allowDirectMessages);
  });

  it('is honest about which settings this build can act on', () => {
    // The three with a real send point to gate.
    expect(PRIVACY_ENFORCEMENT.showOnlineStatus).toBe(true);
    expect(PRIVACY_ENFORCEMENT.showTypingIndicators).toBe(true);
    expect(PRIVACY_ENFORCEMENT.sendReadReceipts).toBe(true);
    // The three that need the server to refuse, or a platform that can observe
    // a screenshot. A client that declines to display something has not stopped
    // anyone from sending it, so claiming enforcement here would be theatre.
    expect(PRIVACY_ENFORCEMENT.allowDirectMessages).toBe(false);
    expect(PRIVACY_ENFORCEMENT.showProfileToStrangers).toBe(false);
    expect(PRIVACY_ENFORCEMENT.notifyOnScreenshot).toBe(false);
  });
});

describe('typing indicators', () => {
  async function makeManager(showTypingIndicators: boolean) {
    // Write to storage, THEN reset modules, so the manager and the settings
    // module it imports are both fresh and read the same value. Without the
    // reset the manager keeps a binding to an earlier settings instance whose
    // in-process cache still holds the previous answer — which is a property of
    // module caching in the test runner, not of the code under test.
    localStorage.setItem(
      'citadel:privacy-settings',
      JSON.stringify({ ...DEFAULT_PRIVACY_SETTINGS, showTypingIndicators }),
    );
    vi.resetModules();
    const { PresenceManager } = await import('../p2p/presence-manager');
    const sendCommand = vi.fn((): Promise<void> => Promise.resolve());
    const manager = new PresenceManager({
      sendCommand,
      getConnectedPeers: () => [7n],
      isConnected: () => true,
    } as unknown as ConstructorParameters<typeof PresenceManager>[0]);
    return { manager, sendCommand };
  }

  it('sends one when the user allows it', async () => {
    const { manager, sendCommand } = await makeManager(true);
    await manager.sendTypingIndicator(7n);
    expect(sendCommand).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the user turned them off', async () => {
    const { manager, sendCommand } = await makeManager(false);
    await manager.sendTypingIndicator(7n);
    expect(sendCommand).not.toHaveBeenCalled();
  });
});

describe('read receipts', () => {
  /**
   * The local half of "read" must happen either way — the user did read the
   * message, so their unread badge has to clear. Only the ack, the part that
   * tells the sender, is theirs to withhold.
   */
  async function markRead(sendReadReceipts: boolean) {
    localStorage.setItem(
      'citadel:privacy-settings',
      JSON.stringify({ ...DEFAULT_PRIVACY_SETTINGS, sendReadReceipts }),
    );
    vi.resetModules();
    const { markMessagesAsRead } = await import('../p2p/messenger-compatibility');

    const message: { id: string; senderCid: bigint; status: "delivered"; } = { id: 'm1', senderCid: 7n, status: 'delivered' as const };
    const conversation: { messages: { id: string; senderCid: bigint; status: "delivered"; }[]; unreadCount: number; } = { messages: [message], unreadCount: 1 };
    const conversationManager: { getConversation: () => { messages: { id: string; senderCid: bigint; status: "delivered"; }[]; unreadCount: number; }; } = { getConversation: (): { messages: { id: string; senderCid: bigint; status: "delivered"; }[]; unreadCount: number; } => conversation };
    const sendMessageAck = vi.fn((): Promise<void> => Promise.resolve());

    await markMessagesAsRead(
      conversationManager as never,
      sendMessageAck,
      vi.fn(),
      7n,
    );
    return { sendMessageAck, message, conversation };
  }

  it('tells the sender when the user allows it', async () => {
    const { sendMessageAck, message } = await markRead(true);
    expect(sendMessageAck).toHaveBeenCalledWith('m1', 'read', 7n);
    expect(message.status).toBe('read');
  });

  it('marks read locally but tells the sender nothing when declined', async () => {
    const { sendMessageAck, message, conversation } = await markRead(false);
    expect(sendMessageAck).not.toHaveBeenCalled();
    // The user's own view still updates — withholding the receipt must not cost
    // them their own unread badge.
    expect(message.status).toBe('read');
    expect(conversation.unreadCount).toBe(0);
  });
});
