/**
 * Call lifecycle as a pure reducer.
 *
 * Calls are where races live: both sides pressing call at once, a decline
 * crossing an accept, an end arriving for a call that already ended, a
 * participant leaving mid-connect. Keeping the rules here — with no media, no
 * sockets and no React — is what makes those cases testable instead of
 * reproducible only by two humans with good timing.
 */

import type {
  CallDeclineReason,
  CallEndReason,
  CallMediaKinds,
} from '@/types/p2p-commands';

export type CallStatus =
  | 'ringing-out'
  | 'ringing-in'
  | 'connecting'
  | 'active'
  | 'ended'
  | 'failed';

export type ParticipantStatus = 'invited' | 'connecting' | 'active' | 'left' | 'declined';

export interface CallParticipant {
  cid: bigint;
  username: string;
  status: ParticipantStatus;
  media: CallMediaKinds;
  speaking: boolean;
}

export interface CallState {
  callId: string;
  status: CallStatus;
  /** Absent for a 1:1 call. */
  roomId: string | null;
  /** True when we placed the call. Decides who wins a glare collision. */
  outgoing: boolean;
  /** Who dialled — null when we did. Their hangup ends a still-ringing call. */
  caller: bigint | null;
  selfMedia: CallMediaKinds;
  participants: Map<bigint, CallParticipant>;
  /** Set when status is 'failed' or 'ended', for the UI to explain itself. */
  reason: string | null;
}

export type CallEvent =
  | { type: 'invite-sent'; callId: string; roomId: string | null; media: CallMediaKinds; invitees: Array<{ cid: bigint; username: string }> }
  | { type: 'invite-received'; callId: string; roomId: string | null; from: { cid: bigint; username: string }; media: CallMediaKinds; others: Array<{ cid: bigint; username: string }> }
  | { type: 'accepted-locally'; media: CallMediaKinds }
  | { type: 'declined-locally'; reason: CallDeclineReason }
  | { type: 'peer-accepted'; cid: bigint; media: CallMediaKinds }
  | { type: 'peer-declined'; cid: bigint; reason: CallDeclineReason }
  | { type: 'peer-media-changed'; cid: bigint; media: CallMediaKinds }
  | { type: 'peer-connected'; cid: bigint }
  | { type: 'peer-left'; cid: bigint }
  | { type: 'self-media-changed'; media: CallMediaKinds }
  | { type: 'speaking-changed'; cid: bigint; speaking: boolean }
  | { type: 'ended'; reason: CallEndReason }
  | { type: 'failed'; reason: string };

export const NO_MEDIA: CallMediaKinds = { audio: false, video: false, screen: false };

// Beyond these, a mesh sender's uplink and encoder count stop being survivable.
export const MAX_VIDEO_PARTICIPANTS = 8;
export const MAX_AUDIO_PARTICIPANTS = 12;

function newParticipant(cid: bigint, username: string, status: ParticipantStatus, media: CallMediaKinds): CallParticipant {
  return { cid, username, status, media, speaking: false };
}

function withParticipant(
  state: CallState,
  cid: bigint,
  update: (p: CallParticipant) => CallParticipant,
): CallState {
  const existing = state.participants.get(cid);
  if (!existing) return state;
  const participants = new Map(state.participants);
  participants.set(cid, update(existing));
  return { ...state, participants };
}

/** True once anyone is actually in the call with us. */
function anyoneActive(participants: Map<bigint, CallParticipant>): boolean {
  for (const p of participants.values()) {
    if (p.status === 'active' || p.status === 'connecting') return true;
  }
  return false;
}

/** True when every invitee has said no or gone. */
function everyoneGone(participants: Map<bigint, CallParticipant>): boolean {
  if (participants.size === 0) return false;
  for (const p of participants.values()) {
    if (p.status !== 'declined' && p.status !== 'left') return false;
  }
  return true;
}

export function initialState(callId: string): CallState {
  return {
    callId,
    status: 'ringing-out',
    roomId: null,
    outgoing: true,
    caller: null,
    selfMedia: NO_MEDIA,
    participants: new Map(),
    reason: null,
  };
}

export function reduce(state: CallState | null, event: CallEvent): CallState | null {
  switch (event.type) {
    case 'invite-sent': {
      const participants = new Map<bigint, CallParticipant>();
      for (const invitee of event.invitees) {
        participants.set(invitee.cid, newParticipant(invitee.cid, invitee.username, 'invited', NO_MEDIA));
      }
      return { callId: event.callId, status: 'ringing-out', roomId: event.roomId, outgoing: true, caller: null, selfMedia: event.media, participants, reason: null };
    }

    case 'invite-received': {
      // A second invite for a call we are already in is a retransmit, not a new
      // call; adopting it would reset a live call back to ringing.
      if (state && state.callId === event.callId) return state;
      // The caller is already in the call they dialled — 'connecting', which is
      // what lets accept() open their session while co-invitees wait for their
      // own accepts. First into the map: the ringing card reads values()[0].
      const participants = new Map<bigint, CallParticipant>([
        [event.from.cid, newParticipant(event.from.cid, event.from.username, 'connecting', event.media)],
      ]);
      // Co-invitees: every invitee holds the caller's roster, so the mesh can
      // form without the caller relaying anything.
      for (const other of event.others) {
        if (other.cid === event.from.cid) continue;
        participants.set(other.cid, newParticipant(other.cid, other.username, 'invited', NO_MEDIA));
      }
      return { callId: event.callId, status: 'ringing-in', roomId: event.roomId, outgoing: false, caller: event.from.cid, selfMedia: NO_MEDIA, participants, reason: null };
    }

    default:
      break;
  }

  if (!state) return null;

  switch (event.type) {
    case 'accepted-locally':
      if (state.status !== 'ringing-in') return state;
      return { ...state, status: 'connecting', selfMedia: event.media };

    case 'declined-locally':
      return { ...state, status: 'ended', reason: event.reason };

    case 'peer-accepted': {
      const next = withParticipant(state, event.cid, (p) => ({
        ...p,
        status: 'connecting',
        media: event.media,
      }));
      // Our own status only advances out of ringing once someone answers.
      return next.status === 'ringing-out' ? { ...next, status: 'connecting' } : next;
    }

    case 'peer-connected': {
      const next = withParticipant(state, event.cid, (p) => ({ ...p, status: 'active' }));
      return next.status === 'connecting' || next.status === 'ringing-out'
        ? { ...next, status: 'active' }
        : next;
    }

    case 'peer-declined': {
      const next = withParticipant(state, event.cid, (p) => ({ ...p, status: 'declined' }));
      // A 1:1 call where the one person said no is over. A group call carries on
      // — one person declining must not hang up on everybody else.
      return everyoneGone(next.participants)
        ? { ...next, status: 'ended', reason: event.reason }
        : next;
    }

    case 'peer-left': {
      const next = withParticipant(state, event.cid, (p) => ({ ...p, status: 'left' }));
      // The caller cancelling ends a still-ringing call outright — the seeded
      // co-invitees never answered, so "everyone gone" would never come true.
      if (next.status === 'ringing-in' && event.cid === next.caller) {
        return { ...next, status: 'ended', reason: 'hangup' };
      }
      if (anyoneActive(next.participants)) return next;
      return everyoneGone(next.participants)
        ? { ...next, status: 'ended', reason: 'hangup' }
        : next;
    }

    case 'peer-media-changed':
      return withParticipant(state, event.cid, (p) => ({ ...p, media: event.media }));

    case 'speaking-changed':
      return withParticipant(state, event.cid, (p) => ({ ...p, speaking: event.speaking }));

    case 'self-media-changed':
      return { ...state, selfMedia: event.media };

    case 'ended':
      // Terminal: a late 'ended' for an already-failed call must not overwrite
      // the reason the user is being shown.
      if (state.status === 'failed') return state;
      return { ...state, status: 'ended', reason: event.reason };

    case 'failed':
      if (state.status === 'ended') return state;
      return { ...state, status: 'failed', reason: event.reason };

    default:
      return state;
  }
}

/**
 * Who should win when both sides call each other at the same instant.
 *
 * Without a rule, both sides see an incoming call while their own is ringing
 * out, and either both cancel or both wait. Comparing call ids is arbitrary but
 * consistent: both peers compute the same answer without another round trip.
 */
export function glareWinner(ourCallId: string, theirCallId: string): 'ours' | 'theirs' {
  return ourCallId > theirCallId ? 'ours' : 'theirs';
}

/** Whether another participant can join without overloading the mesh. */
export function canAddParticipant(state: CallState, withVideo: boolean): boolean {
  const active = [...state.participants.values()].filter(
    (p) => p.status !== 'left' && p.status !== 'declined',
  ).length;
  return active < (withVideo ? MAX_VIDEO_PARTICIPANTS : MAX_AUDIO_PARTICIPANTS);
}
