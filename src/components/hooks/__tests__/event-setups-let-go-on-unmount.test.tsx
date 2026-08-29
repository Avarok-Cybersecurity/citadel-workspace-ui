/**
 * A hook that subscribes must unsubscribe, and these two did not.
 *
 * `workspaceEvents.onMemberEvent` and `onWorkspaceEvent` return their
 * unsubscribe SYNCHRONOUSLY. `useMemberEventSetup` and `useWorkspaceEventSetup`
 * captured neither, and their effects returned no cleanup — so every remount
 * left another set of live listeners behind, each retaining a closure over
 * `setState`, and every event afterwards ran an ever-growing pile of dead
 * handlers.
 *
 * Nothing broke visibly, because setState on an unmounted component is a no-op.
 * That is exactly why it accumulated. `use-domain-members` carries the same
 * paragraph about the same mistake — fixed there, and not here.
 *
 * The sibling `useMessageEventSetup` calls `cleanupAllListeners()` on unmount,
 * which does remove these — and every listener this hook never created. Owning
 * your own unsubscribe is not the same as somebody else clearing the room.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { eventEmitter } from '@/lib/event-emitter';
import { useMemberEventSetup } from '../useMemberEventSetup';

vi.mock('@/lib/workspace-service', () => ({
  default: { listMembers: vi.fn(async () => {}) },
}));

/**
 * How many of the hook's `members:loaded` handlers are still live.
 *
 * Counted through `setState`, which every one of them calls — the first version
 * of this counted its own probe's invocations, so it returned 1 whatever the
 * hook had done and both tests were measuring nothing.
 */
function liveHandlers(setState: ReturnType<typeof vi.fn>): number {
  setState.mockClear();
  eventEmitter.emit('members:loaded', { members: [], domainId: 'd', connection: {} });
  return setState.mock.calls.length;
}

describe('the member event setup', () => {
  it('leaves no listener behind when it unmounts', async () => {
    const setState: ReturnType<typeof vi.fn> = vi.fn();
    const { unmount } = renderHook(() => useMemberEventSetup({ setState }));
    await new Promise((resolve): void => { setTimeout(resolve, 20); });
    const mounted: number = liveHandlers(setState);

    unmount();
    await new Promise((resolve): void => { setTimeout(resolve, 20); });
    const after: number = liveHandlers(setState);

    // `mounted` is the positive control: if the hook never subscribed at all,
    // "nothing left behind" would be trivially true and mean nothing.
    expect(mounted).toBeGreaterThan(0);
    expect(after).toBe(0);
  });

  it('does not accumulate across remounts', async () => {
    // The shape of the leak: this hook lives in AppLayout's MembersSection,
    // which remounts on every route change.
    const setState: ReturnType<typeof vi.fn> = vi.fn();

    const first: ReturnType<typeof renderHook> = renderHook(() => useMemberEventSetup({ setState }));
    await new Promise((resolve): void => { setTimeout(resolve, 20); });
    const oneMount: number = liveHandlers(setState);
    first.unmount();

    const second: ReturnType<typeof renderHook> = renderHook(() => useMemberEventSetup({ setState }));
    await new Promise((resolve): void => { setTimeout(resolve, 20); });
    const remounted: number = liveHandlers(setState);
    second.unmount();

    expect(oneMount).toBeGreaterThan(0);
    expect(remounted).toBe(oneMount);
  });
});
