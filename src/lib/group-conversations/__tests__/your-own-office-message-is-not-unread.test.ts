/**
 * Your own office/room message does not count as unread.
 *
 * Live (owner, 2026-09-27), the unread-badge half of "I get a notification for my own
 * message": `applyGroupMessage` decided `fromSelf` by CID only, and an office channel's
 * `sender_id` is the account USERNAME, so every message you sent there raised your own badge.
 *
 * Mocked: the tab's CID and session identity -- multi-tab election and session I/O; the store
 * rule under test is production code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/multi-instance/instance-manager', () => ({ instanceManager: { get cid(): bigint | null { return 111n; } } }));
vi.mock('@/lib/multi-instance', () => ({ instanceManager: { get cid(): bigint | null { return 111n; } } }));
vi.mock('@/lib/connection', () => ({ connectionManager: { getConnectionInfo: (): { username: string } => ({ username: 'thomas' }) } }));

const { applyGroupMessage } = await import('../apply-group-message');
const { forgetSeenIds } = await import('@/lib/seen-ids');
import type { GroupConversation } from '@/types/group';

const groups = (): GroupConversation[] => [{ id: 'chan-1', unreadCount: 0, lastMessageTime: 0, lastMessagePreview: '' } as unknown as GroupConversation];
const byCid = (cid: bigint): string => cid.toString();

describe('an office/room message you sent', () => {
  beforeEach((): void => { forgetSeenIds(); });

  it('does not raise your unread count when the sender is your username', () => {
    const next: GroupConversation[] = applyGroupMessage(groups(), { groupId: 'chan-1', senderId: 'thomas', content: 'hi', messageId: 'm1' }, 5, byCid);
    expect(next[0].unreadCount).toBe(0);
  });

  it("still counts someone else's office message", () => {
    const next: GroupConversation[] = applyGroupMessage(groups(), { groupId: 'chan-1', senderId: 'lara', content: 'hi', messageId: 'm2' }, 5, byCid);
    expect(next[0].unreadCount).toBe(1);
  });
});
