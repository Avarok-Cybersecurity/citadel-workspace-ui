/**
 * Format a timestamp into a human-readable relative time string
 * @param timestamp Timestamp in milliseconds
 * @returns Human-readable relative time string (e.g., "just now", "5 minutes ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffSeconds = Math.floor((now - timestamp) / 1000);
  
  if (diffSeconds < 5) {
    return 'just now';
  }
  
  if (diffSeconds < 60) {
    return `${diffSeconds} seconds ago`;
  }
  
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  }
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  }
  
  const date = new Date(timestamp);
  return date.toLocaleString();
}
