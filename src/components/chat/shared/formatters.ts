/**
 * Shared chat formatters and utilities
 * Used by both P2PChat and GroupChatView components
 */

/**
 * Format a timestamp to HH:MM format
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format a date with relative labels (Today, Yesterday, or date string)
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString();
  }
}

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
export function groupMessagesByDate<T extends { timestamp: number }>(
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
