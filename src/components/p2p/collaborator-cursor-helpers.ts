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
    const r: number = parseInt(result[1], 16);
    const g: number = parseInt(result[2], 16);
    const b: number = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

/** Generate unique ID for flash comments */
export function generateFlashCommentId(): string {
  return `flash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Build a `FlashComment` for the context-menu emission path, or return
 * `null` if the text is empty / whitespace-only.
 *
 * Returning `null` (vs. always emitting) is the bug guard the reviewer
 * caught: the prior implementation broadcast `text: ''` straight to
 * remote collaborators, who would see an empty flash bubble at the
 * cursor position. The cursor-tooltip path in `CollaboratorCursor.tsx`
 * already gates on `text && words.length <= 100`; this helper mirrors
 * the same contract for the editor context-menu entry point.
 *
 * Pure for unit testing — see `__tests__/collaborator-cursor-helpers.test.ts`.
 */
export function buildContextMenuFlashComment(
  rawText: string | null | undefined,
  cursorCoords: { top: number; left: number },
  user: { userId: string; userName: string; userColor: string },
): FlashComment | null {
  const text: string = (rawText ?? '').trim();
  if (!text) return null;
  return {
    id: generateFlashCommentId(),
    userId: user.userId,
    userName: user.userName,
    userColor: user.userColor,
    text,
    position: { top: cursorCoords.top, left: cursorCoords.left },
    timestamp: Date.now(),
  };
}
