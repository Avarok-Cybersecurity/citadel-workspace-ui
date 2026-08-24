/**
 * WorkspaceMetadataService
 * Handles extraction and processing of workspace metadata including logos
 */

import { debugLog } from './debug-config';
import type { WorkspaceIcon } from '@/lib/theme/theme-types';

// Interface for workspace logo information
export interface WorkspaceLogo {
  /** 'emoji' when the theme sets one, otherwise initials derived from the name. */
  type: 'emoji' | 'initials';
  data: string;
}

/**
 * The workspace's logo: its themed icon, or initials as a fallback.
 *
 * This previously took `Record<string, any>` and tested `metadata.logo`. The
 * metadata is a `Vec<u8>` byte array, so that property was always undefined and
 * the image branch was unreachable — every workspace silently fell back to
 * initials, with no type error possible because `any` accepts the lookup.
 *
 * The icon now comes from the workspace theme, which is where it is actually
 * edited and stored, rather than being guessed at from raw bytes.
 */
export function getWorkspaceLogo(workspaceName: string, icon?: WorkspaceIcon): WorkspaceLogo {
  if (icon?.emoji) {
    return { type: 'emoji', data: icon.emoji };
  }

  return {
    type: 'initials',
    data: getWorkspaceInitials(workspaceName),
  };
}

/**
 * Generate initials from workspace name
 * @param workspaceName The name of the workspace
 * @returns String containing the initials (1-2 characters)
 */
export function getWorkspaceInitials(workspaceName: string): string {
  if (!workspaceName) return '?';
  
  // Split by spaces, remove empty parts, and get initials
  const parts = workspaceName.trim().split(/\s+/).filter(Boolean);
  
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  
  // Get first letter of first and last parts
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Generate initials from user's full name
 * @param fullName The full name of the user
 * @returns String containing the initials (1-2 characters)
 */
export function getUserInitials(fullName: string): string {
  if (!fullName) return '?';
  
  // Split by spaces, remove empty parts, and get initials
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  
  // Get first letter of first and last parts
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
