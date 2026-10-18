/** The editor's settings, stated once. */
import type { Platform } from './input/keymap';

/** Idle time after which typing ends its undo step. */
export const UNDO_PAUSE_MS: number = 1000;

export function platformOf(userAgent: string): Platform {
  return /Mac|iPhone|iPad|iPod/.test(userAgent) ? 'mac' : 'other';
}
