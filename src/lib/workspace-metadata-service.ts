/**
 * WorkspaceMetadataService
 * Handles extraction and processing of workspace metadata including logos
 */

// Interface for workspace logo information
export interface WorkspaceLogo {
  type: 'image' | 'initials';
  data: string; // Either base64 image data or initials string
}

/**
 * Extract workspace logo from metadata or generate from workspace name
 * @param workspaceName The name of the workspace
 * @param metadata Optional metadata that might contain logo information
 * @returns WorkspaceLogo object with either image data or initials
 */
export function getWorkspaceLogo(workspaceName: string, metadata?: Record<string, any>): WorkspaceLogo {
  // Try to extract logo from metadata if it exists
  if (metadata && metadata.logo && typeof metadata.logo === 'string') {
    try {
      // Check if it's a valid base64 image
      if (metadata.logo.startsWith('data:image')) {
        return {
          type: 'image',
          data: metadata.logo
        };
      }
    } catch (error) {
      console.error('Error parsing workspace logo from metadata:', error);
    }
  }
  
  // If no logo found in metadata or error occurred, generate initials from workspace name
  return {
    type: 'initials',
    data: getWorkspaceInitials(workspaceName)
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
