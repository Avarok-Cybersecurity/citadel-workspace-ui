/**
 * A group message can be Markdown, and says so on both group wires.
 *
 * Owner, 2026-09-27: "Text / MDX (rich) / Live Doc should be available in every chat context".
 * Offices, rooms and peer groups sent plain text only. The office wire already had a
 * `message_type`; the peer envelope gains one, absent for text, so a text message's bytes are
 * unchanged and a build that predates this still reads the text.
 *
 * No mocks: the real codec and the real inbound summary.
 */
import { describe, it, expect, vi, type MockInstance } from 'vitest';
import WorkspaceService from '@/lib/workspace-service';
import { GroupMessageTypeTS } from '@/types/workspace-protocol';
import { sendGroupMessageAnywhere } from '../send-group-message';
import { encode as cborEncode } from 'cbor-x';
import { decodeGroupMessage, encodeGroupMessage, type PeerGroupMessage } from '../group-message-codec';

const base: PeerGroupMessage = { group_id: '7:42', message_id: 'm1', sender_cid: 7n, content: '**hi**', timestamp: 1 };

describe('the peer-group envelope', () => {
  it('carries Markdown, and reads it back', () => {
    expect(decodeGroupMessage(encodeGroupMessage({ ...base, message_type: 'Markdown' }))?.message_type).toBe('Markdown');
  });

  it('leaves a text message exactly as it was, and reads an old envelope as text', () => {
    expect(encodeGroupMessage(base)).toEqual(cborEncode(base));
    expect(decodeGroupMessage(cborEncode(base))?.message_type).toBeUndefined();
  });

  it('ignores a type it does not know rather than trusting it', () => {
    expect(decodeGroupMessage(cborEncode({ ...base, message_type: 'System' }))?.message_type).toBeUndefined();
  });
});

describe('a Markdown peer-group message arriving', () => {
  it('is summarised as Markdown, so the thread renders it as such', async () => {
    const { peerGroupMessageEvent } = await import('../peer-group-inbound');
    const notification: Record<string, unknown> = {
      cid: 111n, peer_cid: 7n, group_key: { cid: 7n, mgid: 42n }, request_id: 'r1',
      message: Array.from(encodeGroupMessage({ ...base, message_type: 'Markdown' })),
    };
    expect(peerGroupMessageEvent(notification, (): string => 'ada')?.messageType).toBe('Markdown');
  });
});

describe('a Markdown message in an office or room', () => {
  it('is sent as Markdown on the office wire', async () => {
    // Spied: the workspace request, the server round-trip; the choice of wire and type is production code.
    const send: MockInstance<typeof WorkspaceService.sendGroupMessage> = vi.spyOn(WorkspaceService, 'sendGroupMessage').mockResolvedValue(undefined);
    await sendGroupMessageAnywhere('3f2b9c1e-office-channel', '# Agenda', 'Markdown');
    expect(send).toHaveBeenCalledWith('3f2b9c1e-office-channel', '# Agenda', GroupMessageTypeTS.Markdown, undefined);
    send.mockRestore();
  });
});
