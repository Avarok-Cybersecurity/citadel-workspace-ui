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

/** Someone a call knows about, before they are a full participant. */
export interface CallPeerRef {
  cid: bigint;
  username: string;
}

export type CallEvent =
  | {
      type: 'invite-sent';
      callId: string;
      roomId: string | null;
      media: CallMediaKinds;
      invitees: CallPeerRef[];
    }
  | {
      type: 'invite-received';
      callId: string;
      roomId: string | null;
      from: CallPeerRef;
      media: CallMediaKinds;
      /** The caller's other invitees, so this peer can build the same mesh. */
      others: CallPeerRef[];
    }
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
