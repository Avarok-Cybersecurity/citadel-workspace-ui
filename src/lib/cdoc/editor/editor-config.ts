/** The editor's settings, stated once. */
import type { Platform } from './input/keymap';

/** Idle time after which typing ends its undo step. */
export const UNDO_PAUSE_MS: number = 1000;

export function platformOf(userAgent: string): Platform {
  return /Mac|iPhone|iPad|iPod/.test(userAgent) ? 'mac' : 'other';
}

/**
 * One phase of the caret's blink, visible or hidden: Windows' default caret blink time (Word
 * blinks at the system's rate), within a few ms of Chromium's own 500.
 */
export const CARET_BLINK_MS: number = 530;
