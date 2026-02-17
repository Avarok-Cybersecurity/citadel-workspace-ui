/**
 * Types and helper functions for CollaboratorCursor.
 */

export interface CursorUser {
  name: string;
  color: string;
}

export interface FlashComment {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  text: string;
  position: { top: number; left: number };
  timestamp: number;
}

/** Parse hex color to RGBA for transparency */
export function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

/** Generate unique ID for flash comments */
export function generateFlashCommentId(): string {
  return `flash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
