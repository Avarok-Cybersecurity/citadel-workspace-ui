/**
 * A peer who left while their open was in flight must not come back.
 *
 * The sibling file covers the CALL ending mid-open. This is the same race one
 * level down: the call is still live, but that one participant has gone.
 *
 * Teardown cannot cancel it. `closeSessionFor` returns early on
 * `!openSessions.delete(cid)`, and a peer whose open has not resolved is not
 * in `openSessions` yet — it is added on the line after the check. So the
 * close is a no-op, the open then confirms, and `peer-connected` marks the
 * departed peer active again.
 *
 * What that costs: a ghost tile with released decoders, a media session held
 * open on the service forever, `sendFrame` still encoding to somebody who
 * left, and — because `anyoneActive` is true for the ghost — a call that never
 * reaches 'ended'. Camera light on, duration ticking, nobody there.
 *
 * The FAILURE path already re-reads the participant (`state.participants.has`)
 * before retrying. The success path re-read only the call.
 */
import { describe, it, expect } from 'vitest';
import type { CallEvent, CallState } from '../call-state';
import type { CallManagerInternals } from '../call-manager-internals';
import { openSessionFor } from '../media-session-lifecycle';

const PEER = 42n;

interface Harness {
  m: CallManagerInternals;
  applied: CallEvent[];
  closed: bigint[];
  resolveOpen: () => void;
  setParticipant: (status: string | null) => void;
}

function harness(): Harness {
  const applied: CallEvent[] = [];
  const closed: bigint[] = [];
  let resolveOpen: () => void = (): void => {};
  const opened: Promise<void> = new Promise<void>((resolve) => { resolveOpen = resolve; });

  let participant: string | null = 'connecting';
  const state = (): CallState => ({
    status: 'active',
    participants:
      participant === null
        ? new Map()
        : new Map([[PEER, { cid: PEER, status: participant }]]),
  }) as unknown as CallState;

  const m: CallManagerInternals = {
    transport: {
      openSession: (): Promise<void> => opened,
      closeSession: async (cid: bigint): Promise<void> => { closed.push(cid); },
    },
    openSessions: new Set<bigint>(),
    openingSessions: new Map<bigint, Promise<void>>(),
    now: (): number => 0,
    getState: (): CallState | null => state(),
    apply: (event: CallEvent): void => { applied.push(event); },
  } as unknown as CallManagerInternals;

  return { m, applied, closed, resolveOpen, setParticipant: (s): void => { participant = s; } };
}

describe('a session that confirms after the peer left', () => {
  it('is closed rather than registered', async (): Promise<void> => {
    const h: Harness = harness();
    const pending: Promise<void> = openSessionFor(h.m, PEER);

    h.setParticipant('left');
    h.resolveOpen();
    await pending;

    expect([...h.m.openSessions], 'a media session nothing will ever close').toEqual([]);
    expect(h.closed, 'the session was left open on the service').toEqual([PEER]);
  });

  it('does not mark the departed peer connected again', async (): Promise<void> => {
    // `peer-connected` is what keeps `anyoneActive` true. Applying it for a
    // peer who left means the call can never end.
    const h: Harness = harness();
    const pending: Promise<void> = openSessionFor(h.m, PEER);

    h.setParticipant('left');
    h.resolveOpen();
    await pending;

    expect(h.applied).toEqual([]);
  });

  it('treats a declined peer the same as one who left', async (): Promise<void> => {
    const h: Harness = harness();
    const pending: Promise<void> = openSessionFor(h.m, PEER);

    h.setParticipant('declined');
    h.resolveOpen();
    await pending;

    expect([...h.m.openSessions]).toEqual([]);
  });

  it('treats a participant dropped from the map the same', async (): Promise<void> => {
    const h: Harness = harness();
    const pending: Promise<void> = openSessionFor(h.m, PEER);

    h.setParticipant(null);
    h.resolveOpen();
    await pending;

    expect([...h.m.openSessions]).toEqual([]);
  });

  it('still registers a peer who is present when the open confirms', async (): Promise<void> => {
    // The control. Without it the fix could close every session and no
    // assertion about departed peers would notice.
    const h: Harness = harness();
    const pending: Promise<void> = openSessionFor(h.m, PEER);

    h.resolveOpen();
    await pending;

    expect([...h.m.openSessions]).toEqual([PEER]);
    expect(h.applied.map((e) => e.type)).toEqual(['peer-connected']);
  });
});
