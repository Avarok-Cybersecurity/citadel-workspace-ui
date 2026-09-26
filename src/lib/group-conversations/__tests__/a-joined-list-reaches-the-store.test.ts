/**
 * The joined list is bound where the store starts, so a new browser's sidebar
 * actually gains the groups -- not only the pure fold in learn-joined-groups.
 */
import { describe, it, expect, vi } from 'vitest';

const h: { cid: bigint | null } = vi.hoisted((): { cid: bigint | null } => ({ cid: 100n }));
vi.mock('@/lib/multi-instance/instance-manager', () => ({
  instanceManager: { get cid(): bigint | null { return h.cid; } },
}));
// The state request goes out over the socket; this suite asserts only what the store holds.
vi.mock('../announce-group-state', () => ({
  sendGroupControl: vi.fn(async (): Promise<string> => 'sent'),
  announceGroupState: vi.fn(),
}));

describe('the joined list', () => {
  it('adds the listed group to the store once the bindings start', async () => {
    vi.resetModules();
    const store: typeof import('../group-store') = await import('../group-store');
    const { eventEmitter } = await import('@/lib/event-emitter');
    const announce: typeof import('../announce-group-state') = await import('../announce-group-state');
    store.startGroupEventBindings();

    eventEmitter.emit('group:joined-list-received', { groupIds: ['7:42'], selfUsername: 'self', memberUsernames: { '7': 'owner7' } });

    const group = store.getGroups().find((g) => g.id === '7:42');
    expect(group).toMatchObject({ ownerId: 7n, awaitingState: true });
    expect(group?.members.map((m) => m.username)).toEqual(['owner7', 'self']);
    expect(announce.sendGroupControl).toHaveBeenCalledWith('7:42', { request_state: true });
  });
});
