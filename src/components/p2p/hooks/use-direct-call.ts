import { useCall } from '@/lib/call/call-context';
import { useCallDuration } from '@/components/call/use-call-duration';
import type { CallState } from '@/lib/call/call-state';
import type { ConnectionQuality } from '@/components/call/ParticipantTile';

export interface DirectCallBinding {
  /** The call belonging to THIS conversation, or null. */
  call: CallState | null;
  active: boolean;
  duration: string;
  localStream: MediaStream | null;
  remoteStreams: Map<bigint, MediaStream>;
  remoteAudioStreams: Map<bigint, MediaStream>;
  qualities: Map<bigint, ConnectionQuality>;
  capability: { supported: boolean; reason?: string };
  startCall: (video: boolean) => void;
  leave: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
}

/**
 * Binds the app-wide call to one direct conversation.
 *
 * The scoping is the whole point: a call is global to the tab, but its surface
 * belongs to exactly one conversation. Without these conditions a call with one
 * person renders its stage over an unrelated chat.
 */
export function useDirectCall(peerCid: bigint, peerName: string): DirectCallBinding {
  const {
    call,
    localStream,
    remoteStreams,
    remoteAudioStreams,
    qualities,
    capability,
    startCall,
    leave,
    toggleMic,
    toggleCamera,
  } = useCall();

  // roomId must be null: a GROUP call that happens to include this peer belongs
  // to its room's surface, not to the 1:1 chat with them.
  //
  // 'ended' is excluded but 'failed' deliberately is not. A call the user left
  // has nothing more to say, and leaving its surface up makes Leave look like it
  // did not work — but a call that FAILED still owes them the reason, which the
  // stage renders.
  const active =
    call !== null &&
    call.roomId === null &&
    call.participants.has(peerCid) &&
    call.status !== 'ended';

  const duration = useCallDuration(active && call?.status === 'active');

  return {
    call: active ? call : null,
    active,
    duration,
    localStream,
    remoteStreams,
    remoteAudioStreams,
    qualities,
    capability,
    startCall: (video) => void startCall([{ cid: peerCid, username: peerName }], video),
    leave: () => void leave(),
    toggleMic: () => void toggleMic(),
    toggleCamera: () => void toggleCamera(),
  };
}
