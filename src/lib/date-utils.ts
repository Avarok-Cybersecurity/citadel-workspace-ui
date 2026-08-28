/**
 * Format a timestamp into a human-readable relative time string
 * @param timestamp Timestamp in milliseconds
 * @returns Human-readable relative time string (e.g., "just now", "5 minutes ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now: number = Date.now();
  const diffSeconds: number = Math.floor((now - timestamp) / 1000);
  
  if (diffSeconds < 5) {
    return 'just now';
  }
  
  if (diffSeconds < 60) {
    return `${diffSeconds} seconds ago`;
  }
  
  const diffMinutes: number = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  
  const diffHours: number = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  }
  
  const diffDays: number = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  }
  
  const date: Date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Presence line for a user, when last-seen time may be unknown.
 *
 * Nothing in the workspace tracks last-seen yet. Callers previously invented a
 * value — `Math.random()` offsets in UserSearch, a literal `0` in UserDirectory
 * (rendered as a date in 1970), and `?? Date.now()` in UserProfileCard (rendered
 * as "just now"). Three different fictions for the same missing fact. Saying so
 * plainly is the honest option, and keeps the decision in one place.
 */
export function formatPresence(isOnline: boolean, lastActive?: number): string {
  if (isOnline) return 'Online now';
  if (!lastActive) return 'Last seen unknown';
  return `Last active ${formatRelativeTime(lastActive)}`;
}
