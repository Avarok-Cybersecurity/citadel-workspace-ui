/**
 * Chat display helpers.
 *
 * `formatTime` and `formatDate` used to have their own bodies here, byte-for-byte
 * the same as `formatClock` and `formatDay` in `lib/format-time.ts`. That file's
 * header explains why it exists: there were SIX independent time formatters,
 * two pinned to `'en-US'`, so one instant read "2:07 PM" in a chat bubble,
 * "8/27/2026, 2:07:33 PM" in the files sidebar and "3 minutes ago" in a
 * notification.
 *
 * The consolidation reached four of the six. These two survived, unreferenced
 * copies of the canonical pair sitting one import away — so the module written
 * to end duplicate formatters was itself duplicated, and the copies were the
 * ones the chat actually rendered with.
 *
 * They are re-exports now, under the names the chat components already use.
 * Renaming the call sites instead would have been a larger diff to the same
 * end, and `formatTime` is the name a message bubble wants.
 */

import { formatClock, formatDay } from '@/lib/format-time';

/** The clock beside a message. Canonical implementation: `lib/format-time`. */
export const formatTime = formatClock;

/** Today / Yesterday / a date, for separators. Canonical: `lib/format-time`. */
export const formatDate = formatDay;

/**
 * Extract initials from a name (max 2 characters)
 */
export function getInitials(name: string): string {
  if (!name) return '??';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Group messages by date for display with date separators
 */
export function groupMessagesByDate<T extends { timestamp: number | bigint }>(
  messages: T[]
): Record<string, T[]> {
  return messages.reduce((acc, message) => {
    const dateKey = formatDate(message.timestamp);
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(message);
    return acc;
  }, {} as Record<string, T[]>);
}
