/**
 * "Load older messages" greyed itself out for fifteen seconds and did nothing.
 *
 * A peer group has no older page to fetch, so `loadMoreMessages` returns early
 * for it — but that return came AFTER `setLoadingMore(true)` and after
 * `armLoadingDeadline`, which is a fifteen-second timer whose only job is to
 * clear the flag if a response never arrives. The button is
 * `disabled={loadingMore}`, so a click did exactly one thing: disable itself
 * until the deadline fired.
 *
 * A guard that runs after the state it is guarding is not a guard.
 *
 * Asserted against the source because what was wrong is the ORDER of three
 * statements, and a test that drove the hook would need the whole chat surface
 * to observe a button that is disabled for a while and then is not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE: string = readFileSync(
  join(process.cwd(), 'src/components/chat/useGroupChat.ts'),
  'utf8',
);

/** `loadMoreMessages`' body, comments stripped so prose cannot satisfy a check. */
function loadMoreBody(): string {
  const start: number = SOURCE.indexOf('const loadMoreMessages:');
  expect(start, 'loadMoreMessages no longer exists; update this test').toBeGreaterThan(-1);
  const end: number = SOURCE.indexOf('const handleSendMessage', start);
  return SOURCE.slice(start, end === -1 ? undefined : end)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('loading older messages', () => {
  it('returns for a peer group before disabling the button', () => {
    const body: string = loadMoreBody();
    const guard: number = body.indexOf("groupSendTransport(groupId) === 'peer'");
    const disable: number = body.indexOf('setLoadingMore(true)');

    expect(guard, 'the peer-group guard is gone').toBeGreaterThan(-1);
    expect(disable, 'nothing disables the button any more').toBeGreaterThan(-1);
    expect(
      guard < disable,
      'the peer-group return runs after the button is disabled, so a click on a \
peer group greys it out for the full deadline and fetches nothing',
    ).toBe(true);
  });

  it('returns before arming the deadline too', () => {
    // The deadline is the thing that makes it fifteen seconds rather than
    // instant. Guarding only the disable would still leave a stray timer.
    const body: string = loadMoreBody();
    const guard: number = body.indexOf("groupSendTransport(groupId) === 'peer'");
    const deadline: number = body.indexOf('armLoadingDeadline(');

    expect(deadline).toBeGreaterThan(-1);
    expect(guard < deadline, 'a timer is armed for a fetch that never happens').toBe(true);
  });

  it('still disables the button for a workspace group', () => {
    // The opposite failure: moving the guard so far up that no group loads, or
    // dropping the disable entirely, would pass both assertions above while
    // making a real fetch spam requests on every scroll.
    const body: string = loadMoreBody();
    const disable: number = body.indexOf('setLoadingMore(true)');
    const fetch: number = body.indexOf('WorkspaceService.getGroupMessages');

    expect(fetch, 'nothing fetches an older page any more').toBeGreaterThan(-1);
    expect(disable < fetch, 'the fetch starts before the button is disabled').toBe(true);
  });
});
