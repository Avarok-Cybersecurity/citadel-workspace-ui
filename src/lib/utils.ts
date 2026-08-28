/**
 * Utils Module
 *
 * Centralized utilities for the Citadel Workspaces application.
 * Re-exports specialized utilities from utils/ subdirectory.
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Tailwind CSS class merging utility (shadcn/ui)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// File size formatting. One implementation, in lib/format-bytes.
export { formatBytes as formatFileSize } from './format-bytes';

// Date formatting with relative time
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes === 0) {
        return 'Just now';
      }
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    }
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return d.toLocaleDateString();
  }
}

// Re-export specialized utilities
export * from './utils/index';
