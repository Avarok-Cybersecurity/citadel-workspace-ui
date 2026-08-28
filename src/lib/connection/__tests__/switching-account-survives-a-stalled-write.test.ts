/**
 * A stalled tab-context write must not silently cancel an account switch.
 *
 * `switchAccount` awaited `setSelectedUser` — an IndexedDB write — before
 * disconnecting and reconnecting. IndexedDB stalls for ordinary reasons: an
 * upgrade blocked by another tab, a busy agent, a private-browsing quota. When
 * it did, the user pressed a workspace icon and nothing happened. No error, no
 * switch, the old account still on screen.
 *
 * `handleAuthSuccess` already raced that exact call against a timeout and
 * continued on expiry, with a comment explaining why. It is the same call, in
 * the next file over. One implementation now, so the next caller inherits the
 * lesson rather than repeating the shape.
 */
import { describe, it, expect, vi } from 'vitest';
import { switchAccount } from '../lifecycle';
import { selectUserWithoutBlocking } from '../select-user';

function harness(selectStalls: boolean) {
  const session = {
    username: 'alice', serverAddress: '127.0.0.1:12349', password: 'pw', cid: 42n,
  };
  const state = {
    findSession: vi.fn(() => session),
    isLeader: true,
  };
  const io = {
    // Never settles, which is what a blocked IndexedDB upgrade looks like.
    setSelectedUser: vi.fn(() => (selectStalls ? new Promise<void>(() => {}) : Promise.resolve())),
    connect: vi.fn(async () => {}),
  };
  return { state, io, session };
}

describe('switching account while tab context is stalled', () => {
  it('still connects to the new account', async () => {
    vi.useFakeTimers();
    const { state, io, session } = harness(true);
    const done: Promise<void> = switchAccount(
      'alice', '127.0.0.1:12349', state as never, io as never,
      vi.fn(async () => {}), vi.fn(async () => { void session; }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await done;
    expect(io.connect).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('selectUserWithoutBlocking', () => {
  it('reports false when the write does not land', async () => {
    vi.useFakeTimers();
    const io = { setSelectedUser: vi.fn(() => new Promise<void>(() => {})) };
    const result: Promise<boolean> = selectUserWithoutBlocking(io as never, {
      selectedUsername: 'alice', selectedServerAddress: 'x',
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await result).toBe(false);
    vi.useRealTimers();
  });

  it('reports true when it does', async () => {
    // The positive control: without it, `false` could be a constant.
    const io = { setSelectedUser: vi.fn(async () => {}) };
    expect(
      await selectUserWithoutBlocking(io as never, {
        selectedUsername: 'alice', selectedServerAddress: 'x',
      }),
    ).toBe(true);
  });

  it('rethrows a real failure, which is not the same as a slow one', async () => {
    // A rejected write means something is wrong with the call, not with the
    // clock. Swallowing both would hide a genuine defect behind a timeout.
    const io = { setSelectedUser: vi.fn(async () => { throw new Error('quota exceeded'); }) };
    await expect(
      selectUserWithoutBlocking(io as never, {
        selectedUsername: 'alice', selectedServerAddress: 'x',
      }),
    ).rejects.toThrow('quota exceeded');
  });
});
