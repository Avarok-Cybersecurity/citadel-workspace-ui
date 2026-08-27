/**
 * How this app writes dates and times.
 *
 * There were six independent formatters — two of them pinned to `'en-US'` — so
 * the same instant read "2:07 PM" in a chat bubble, "8/27/2026, 2:07:33 PM" in
 * the files sidebar and "3 minutes ago" in a notification, and a user with a
 * French-locale browser got US dates in some places and native dates in others.
 *
 * Locale is deliberately the BROWSER's, never a literal. A hardcoded `'en-US'`
 * is not a formatting choice, it is a bug for everyone outside the US: it writes
 * 3/4/2026 to a reader for whom that means the fourth of March.
 */

/** Just the clock: what a message bubble shows beside its text. */
export function formatClock(timestamp: number | bigint): string {
  return new Date(Number(timestamp)).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A day, with Today/Yesterday for the two a reader recognises instantly. */
export function formatDay(timestamp: number | bigint): string {
  const date = new Date(Number(timestamp));
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString();
}

/** Day and time together: list rows, properties panels, file metadata. */
export function formatDateTime(timestamp: number | bigint): string {
  return new Date(Number(timestamp)).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Day and time to the second, for diagnostics.
 *
 * Separate from `formatDateTime` because seconds are noise in a list and the
 * point in a "why did this message not arrive" panel.
 */
export function formatPreciseDateTime(timestamp: number | bigint): string {
  return new Date(Number(timestamp)).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
