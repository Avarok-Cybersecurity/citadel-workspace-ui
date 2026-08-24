/**
 * What the call controls on a group conversation should offer right now.
 *
 * Pure so the group-specific rules — participant caps, join-versus-start,
 * one-call-per-tab — are testable without rendering anything. The component
 * renders whatever this decides and decides nothing itself.
 */

import {
  MAX_AUDIO_PARTICIPANTS,
  MAX_VIDEO_PARTICIPANTS,
  canAddParticipant,
  type CallState,
} from './call-state';

export type GroupCallEntryMode =
  /** No live call: offer to start one, with per-media reasons when the room outgrows the mesh. */
  | { kind: 'start'; audioReason: string | null; videoReason: string | null }
  /** This room's call is ringing us: offer to join it, never to start a rival. */
  | { kind: 'join'; participantCount: number; audioAllowed: boolean; videoAllowed: boolean }
  /** We are in this room's call (including one that failed and still owes its reason). */
  | { kind: 'in-call' }
  /** A call with a different conversation owns this tab's media. */
  | { kind: 'busy'; reason: string };

export function groupCallEntryMode(
  call: CallState | null,
  roomId: string,
  otherMemberCount: number,
): GroupCallEntryMode {
  if (call && call.status !== 'ended') {
    if (call.roomId === roomId) {
      if (call.status === 'ringing-in') {
        // Someone already started this room's call. Joining is the only sane
        // offer — a "start" here puts two people in two calls in one room.
        const participantCount = [...call.participants.values()].filter(
          (p) => p.status !== 'left' && p.status !== 'declined',
        ).length;
        return {
          kind: 'join',
          participantCount,
          audioAllowed: canAddParticipant(call, false),
          videoAllowed: canAddParticipant(call, true),
        };
      }
      return { kind: 'in-call' };
    }
    // A failed call elsewhere is over in every way except its error panel;
    // letting it block calling HERE would strand the user with no way out.
    if (call.status !== 'failed') {
      return {
        kind: 'busy',
        reason:
          call.status === 'ringing-in'
            ? 'You have an incoming call.'
            : 'You are already in another call.',
      };
    }
  }

  // Starting invites every other member, so the mesh must survive all of them
  // answering — refusing up front beats a call that collapses as it fills.
  return {
    kind: 'start',
    audioReason: startReason(otherMemberCount, MAX_AUDIO_PARTICIPANTS, 'audio'),
    videoReason: startReason(otherMemberCount, MAX_VIDEO_PARTICIPANTS, 'video'),
  };
}

function startReason(others: number, cap: number, kind: 'audio' | 'video'): string | null {
  if (others === 0) return 'No one else is in this conversation yet.';
  if (others > cap) {
    return `This group is too large for a ${kind} call — calls carry up to ${cap} other people, and this group has ${others}.`;
  }
  return null;
}
