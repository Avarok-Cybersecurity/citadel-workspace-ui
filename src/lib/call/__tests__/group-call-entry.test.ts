/**
 * The group-specific call rules: caps that refuse a call before it collapses,
 * join-instead-of-start when the room already has a call ringing, and
 * one-call-per-tab. Each wrong answer here is a call that fails mid-air or a
 * room split across two rival calls.
 */
import { describe, it, expect } from 'vitest';
import { groupCallEntryMode } from '../group-call-entry';
import {
  MAX_AUDIO_PARTICIPANTS,
  MAX_VIDEO_PARTICIPANTS,
  type CallParticipant,
  type CallState,
  type CallStatus,
} from '../call-state';

const ROOM = 'room-1';

function participant(cid: bigint, overrides: Partial<CallParticipant> = {}): CallParticipant {
  return {
    cid,
    username: `user-${cid}`,
    status: 'active',
    media: { audio: true, video: false, screen: false },
    speaking: false,
    ...overrides,
  };
}

function call(overrides: Partial<CallState> = {}): CallState {
  return {
    callId: 'c1',
    status: 'active',
    roomId: ROOM,
    outgoing: true,
    caller: null,
    selfMedia: { audio: true, video: false, screen: false },
    participants: new Map([[2n, participant(2n)]]),
    reason: null,
    ...overrides,
  };
}

describe('groupCallEntryMode — start', () => {
  it('offers both media when the room fits a mesh', () => {
    expect(groupCallEntryMode(null, ROOM, 3)).toEqual({
      kind: 'start',
      audioReason: null,
      videoReason: null,
    });
  });

  it('refuses both media in an empty room', () => {
    const mode = groupCallEntryMode(null, ROOM, 0);
    expect(mode.kind).toBe('start');
    if (mode.kind !== 'start') return;
    expect(mode.audioReason).toMatch(/No one else/);
    expect(mode.videoReason).toMatch(/No one else/);
  });

  it('refuses video but still offers audio when the room outgrows the video mesh', () => {
    const mode = groupCallEntryMode(null, ROOM, MAX_VIDEO_PARTICIPANTS + 1);
    expect(mode.kind).toBe('start');
    if (mode.kind !== 'start') return;
    expect(mode.audioReason).toBeNull();
    expect(mode.videoReason).toMatch(/too large/);
  });

  it('refuses even audio when the room outgrows the audio mesh', () => {
    const mode = groupCallEntryMode(null, ROOM, MAX_AUDIO_PARTICIPANTS + 1);
    expect(mode.kind).toBe('start');
    if (mode.kind !== 'start') return;
    expect(mode.audioReason).toMatch(/too large/);
    expect(mode.videoReason).toMatch(/too large/);
  });

  it('allows exactly the cap, since the engine admits the last joiner at cap - 1 actives', () => {
    const mode = groupCallEntryMode(null, ROOM, MAX_VIDEO_PARTICIPANTS);
    expect(mode.kind).toBe('start');
    if (mode.kind !== 'start') return;
    expect(mode.videoReason).toBeNull();
  });

  it('treats an ended call as no call', () => {
    expect(groupCallEntryMode(call({ status: 'ended' }), ROOM, 2).kind).toBe('start');
  });
});

describe('groupCallEntryMode — join in progress', () => {
  it('offers join, not start, when this room is ringing us', () => {
    const mode = groupCallEntryMode(call({ status: 'ringing-in' }), ROOM, 4);
    expect(mode).toEqual({
      kind: 'join',
      participantCount: 1,
      audioAllowed: true,
      videoAllowed: true,
    });
  });

  it('counts only participants still in the call', () => {
    const participants: Map<bigint, CallParticipant> = new Map<bigint, CallParticipant>([
      [2n, participant(2n)],
      [3n, participant(3n, { status: 'left' })],
      [4n, participant(4n, { status: 'declined' })],
      [5n, participant(5n, { status: 'connecting' })],
    ]);
    const mode = groupCallEntryMode(call({ status: 'ringing-in', participants }), ROOM, 4);
    expect(mode.kind).toBe('join');
    if (mode.kind !== 'join') return;
    expect(mode.participantCount).toBe(2);
  });

  it('closes video join once the call reaches the video cap', () => {
    const participants: Map<bigint, CallParticipant> = new Map<bigint, CallParticipant>();
    for (let i: number = 0; i < MAX_VIDEO_PARTICIPANTS; i++) {
      const cid: bigint = BigInt(i + 2);
      participants.set(cid, participant(cid));
    }
    const mode = groupCallEntryMode(call({ status: 'ringing-in', participants }), ROOM, 4);
    expect(mode.kind).toBe('join');
    if (mode.kind !== 'join') return;
    expect(mode.videoAllowed).toBe(false);
    expect(mode.audioAllowed).toBe(true);
  });
});

describe('groupCallEntryMode — in call / busy', () => {
  const inCallStatuses: CallStatus[] = ['ringing-out', 'connecting', 'active', 'failed'];

  it.each(inCallStatuses)('reports in-call for own room while %s', (status) => {
    expect(groupCallEntryMode(call({ status }), ROOM, 2).kind).toBe('in-call');
  });

  it('reports busy when a DM call owns the tab', () => {
    const mode = groupCallEntryMode(call({ roomId: null }), ROOM, 2);
    expect(mode).toEqual({ kind: 'busy', reason: 'You are already in another call.' });
  });

  it('reports busy when another ROOM owns the call', () => {
    expect(groupCallEntryMode(call({ roomId: 'other-room' }), ROOM, 2).kind).toBe('busy');
  });

  it('names an incoming call elsewhere as the reason', () => {
    const mode = groupCallEntryMode(call({ roomId: null, status: 'ringing-in' }), ROOM, 2);
    expect(mode).toEqual({ kind: 'busy', reason: 'You have an incoming call.' });
  });

  it('does not let a FAILED call elsewhere block calling here', () => {
    // The failed call's surface owes the user its reason, but it is over;
    // stranding every other conversation behind it would have no way out.
    expect(groupCallEntryMode(call({ roomId: null, status: 'failed' }), ROOM, 2).kind).toBe(
      'start',
    );
  });
});
