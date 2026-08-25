import { createContext, useContext } from 'react';
import type { CallState } from './call-state';
import type { CaptureFailure } from './media-capture';
import type { CallMediaKinds } from '@/types/p2p-commands';
import type { ConnectionQuality } from '@/components/call/ParticipantTile';

export interface CallContextValue {
  /** The current call, or null when there is none. */
  call: CallState | null;
  localStream: MediaStream | null;
  remoteStreams: Map<bigint, MediaStream>;
  /** Remote audio per peer. Must be attached to an element or nobody hears. */
  remoteAudioStreams: Map<bigint, MediaStream>;
  /** Per-peer link health, for the tiles. Absent entries read as 'good'. */
  qualities: Map<bigint, ConnectionQuality>;
  /** Why capture failed, so the surface can explain rather than just fail. */
  captureFailure: CaptureFailure | null;
  /** Whether this browser can do calls at all, with the reason if not. */
  capability: { supported: boolean; reason?: string };
  startCall: (peers: Array<{ cid: bigint; username: string }>, video: boolean, roomId?: string) => Promise<void>;
  accept: (media: CallMediaKinds) => Promise<void>;
  decline: () => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
}

/**
 * Defaults that no-op rather than throw.
 *
 * Components that read call state are rendered in tests and in surfaces mounted
 * outside the provider; refusing to render there would be worse than simply
 * having no call.
 */
export const CallContext = createContext<CallContextValue>({
  call: null,
  localStream: null,
  remoteStreams: new Map(),
  remoteAudioStreams: new Map(),
  qualities: new Map(),
  captureFailure: null,
  capability: { supported: false, reason: 'Calling is not available here.' },
  startCall: async () => {},
  accept: async () => {},
  decline: async () => {},
  leave: async () => {},
  toggleMic: async () => {},
  toggleCamera: async () => {},
});

export function useCall(): CallContextValue {
  return useContext(CallContext);
}
