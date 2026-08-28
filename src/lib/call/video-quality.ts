import { VIDEO_PROFILE_MAIN, VIDEO_PROFILE_SCREEN, type VideoProfile } from './codec-support';

/**
 * How much bandwidth this person wants their video to cost.
 *
 * A call that stutters is worse than a call that looks soft, and only the
 * person on it knows which they are living with: a hotel wifi, a phone
 * tethering, a metered connection where the bill is the constraint. The encoder
 * already backs off under measured congestion, but that is a reaction to
 * trouble already happening — this is the ceiling somebody sets before it does.
 *
 * `auto` is the default and means "whatever the connection can carry": the full
 * profile, with the existing congestion ladder free to move underneath it.
 */
export type VideoQuality = 'auto' | 'high' | 'balanced' | 'saver';

export interface QualityOption {
  id: VideoQuality;
  label: string;
  /** What it means in plain words, not in codec terms. */
  detail: string;
  /** Roughly what it costs, so the choice can be made on the thing that matters. */
  approxBitrate: string;
}

/**
 * In the order they are offered: most bandwidth first.
 *
 * Ordered that way because the list reads as a slider from "best picture" to
 * "smallest", which is how somebody thinks about it. `auto` sits at the top as
 * the recommendation rather than at the end as an afterthought.
 */
export const VIDEO_QUALITY_OPTIONS: readonly QualityOption[] = [
  {
    id: 'auto',
    label: 'Automatic',
    detail: 'Adjusts to the connection. Best for most calls.',
    approxBitrate: 'up to 1.2 Mbps',
  },
  {
    id: 'high',
    label: 'High detail',
    detail: 'Sharpest picture. Needs a stable connection.',
    approxBitrate: '~1.2 Mbps',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    detail: 'Smaller picture, steadier motion on a busy network.',
    approxBitrate: '~600 kbps',
  },
  {
    id: 'saver',
    label: 'Data saver',
    detail: 'Lowest bandwidth. Faces stay recognisable; fine detail will not.',
    approxBitrate: '~250 kbps',
  },
];

/**
 * The camera profile for a chosen quality.
 *
 * `auto` and `high` are the same profile: the difference is that `auto` leaves
 * the congestion ladder free to reduce it, and `high` is the user saying they
 * would rather have the picture. Neither raises anything above what the codec
 * negotiation already agreed.
 */
export function cameraProfileFor(quality: VideoQuality): VideoProfile {
  switch (quality) {
    case 'balanced':
      return { width: 854, height: 480, framerate: 24, bitrate: 600_000 };
    case 'saver':
      return { width: 640, height: 360, framerate: 15, bitrate: 250_000 };
    case 'auto':
    case 'high':
    default:
      return VIDEO_PROFILE_MAIN;
  }
}

/**
 * The shared-screen profile for a chosen quality.
 *
 * A screen degrades differently from a face: resolution is the last thing to
 * give up, because unreadable text is not a smaller version of readable text,
 * it is nothing. So the saver steps carry the frame rate and the bitrate down
 * and leave the pixels alone for as long as they can.
 */
export function screenProfileFor(quality: VideoQuality): VideoProfile {
  switch (quality) {
    case 'balanced':
      return { ...VIDEO_PROFILE_SCREEN, framerate: 5, bitrate: 1_200_000 };
    case 'saver':
      return { width: 1280, height: 720, framerate: 3, bitrate: 600_000 };
    case 'auto':
    case 'high':
    default:
      return VIDEO_PROFILE_SCREEN;
  }
}

/** Whether the congestion ladder may reduce below the chosen profile. */
export function allowsAdaptation(quality: VideoQuality): boolean {
  // Only 'auto' does. Somebody who picked a level picked it, and having the app
  // quietly move off it makes the setting a suggestion -- which is the worst
  // kind of control, because it looks like it did something.
  return quality === 'auto';
}

export const VIDEO_QUALITY_STORAGE_KEY: string = 'citadel-video-quality';

/** Parse a stored value, refusing anything that is not one of the options. */
export function parseVideoQuality(stored: string | null): VideoQuality {
  const known: readonly string[] = VIDEO_QUALITY_OPTIONS.map((option) => option.id);
  return known.includes(stored ?? '') ? (stored as VideoQuality) : 'auto';
}
