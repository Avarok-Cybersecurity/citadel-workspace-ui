/**
 * The mic and camera toggles.
 *
 * Split from CallProvider so that file holds call lifecycle and this holds
 * device state — they change for different reasons, and the provider was at its
 * 250-line budget.
 */

import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { CallMediaKinds } from '@/types/p2p-commands';

interface ManagerLike {
  getState: () => { selfMedia?: CallMediaKinds } | null | undefined;
  setSelfMedia: (next: CallMediaKinds) => Promise<void>;
}

interface SessionLike {
  getLocalStream: () => MediaStream | null | undefined;
}

export function useCallMediaToggles(
  managerRef: MutableRefObject<ManagerLike | null>,
  sessionRef: MutableRefObject<SessionLike | null>,
  /** Called when the camera cannot be turned on because no track was captured. */
  onCameraUnavailable?: () => void,
  /** Called when the microphone cannot be turned on because its track is gone. */
  onMicUnavailable?: () => void
) {
  const setMedia = useCallback(
    async (next: CallMediaKinds) => {
      await managerRef.current?.setSelfMedia(next);
    },
    [managerRef]
  );

  /**
   * `track.enabled = false` blanks the frames but keeps the device open, which
   * is the standard idiom for a mute toggle and is what peers expect from a
   * mid-call mute. Note for the camera: it means the indicator light stays on
   * after the user turns their camera off. Recorded in docs/ROBUSTNESS.md as a
   * decision to revisit — in a product that sells privacy, a light that stays
   * on reads as "it is still watching me".
   */
  const toggleMic = useCallback(async () => {
    const current = managerRef.current?.getState()?.selfMedia;
    if (!current) return;
    const stream = sessionRef.current?.getLocalStream();
    // Only LIVE tracks. An ended track stays in the stream's track list, so
    // flipping `enabled` on one is a no-op that still announced a state
    // change: after the microphone was unplugged, pressing unmute told every
    // peer the mic was back and left the button reading unmuted, on a device
    // that no longer existed.
    const audioTracks = (stream?.getAudioTracks() ?? []).filter(
      (track) => track.readyState === 'live',
    );

    if (!current.audio && audioTracks.length === 0) {
      onMicUnavailable?.();
      return;
    }

    for (const track of audioTracks) track.enabled = !current.audio;
    await setMedia({ ...current, audio: !current.audio });
  }, [setMedia, managerRef, sessionRef, onMicUnavailable]);

  const toggleCamera = useCallback(async () => {
    const current = managerRef.current?.getState()?.selfMedia;
    if (!current) return;
    const stream = sessionRef.current?.getLocalStream();
    // Live only, for the same reason as the microphone above: the count-based
    // guard below is defeated by a dead track still sitting in the list.
    const videoTracks = (stream?.getVideoTracks() ?? []).filter(
      (track) => track.readyState === 'live',
    );

    // Turning the camera ON with no video track was a no-op that reported
    // success: the loop below iterated nothing, then `setMedia` flipped the
    // button to "on" and announced `video: true` to every peer. Their tiles
    // showed a camera badge and no frame ever arrived. This happens whenever
    // capture fell back to audio-only — a blocked camera, or no camera at all.
    if (!current.video && videoTracks.length === 0) {
      onCameraUnavailable?.();
      return;
    }

    for (const track of videoTracks) track.enabled = !current.video;
    await setMedia({ ...current, video: !current.video });
  }, [setMedia, managerRef, sessionRef, onCameraUnavailable]);

  return { setMedia, toggleMic, toggleCamera };
}
