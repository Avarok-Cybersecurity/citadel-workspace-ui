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
  sessionRef: MutableRefObject<SessionLike | null>
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
    for (const track of stream?.getAudioTracks() ?? []) track.enabled = !current.audio;
    await setMedia({ ...current, audio: !current.audio });
  }, [setMedia, managerRef, sessionRef]);

  const toggleCamera = useCallback(async () => {
    const current = managerRef.current?.getState()?.selfMedia;
    if (!current) return;
    const stream = sessionRef.current?.getLocalStream();
    for (const track of stream?.getVideoTracks() ?? []) track.enabled = !current.video;
    await setMedia({ ...current, video: !current.video });
  }, [setMedia, managerRef, sessionRef]);

  return { setMedia, toggleMic, toggleCamera };
}
