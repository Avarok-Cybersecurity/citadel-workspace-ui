/**
 * Where a collaborator's name tag sits relative to their caret. Pure geometry.
 *
 * The tag must never cover the text a person is reading: it goes ABOVE the caret
 * line, separated by `gap`, and flips BELOW the line only when above would leave
 * the editor's visible area (the first line of a document). Horizontally it is
 * clamped inside the area so a caret at the right edge does not push it out.
 */

export interface Box { top: number; bottom: number; left: number; right: number }
export interface TagSize { width: number; height: number }
export type TagSide = 'above' | 'below';
export interface TagPlacement { top: number; left: number; side: TagSide }

/** Clear space between the caret line and the tag, in CSS px. */
export const TAG_GAP_PX: 2 = 2;
/** Minimum distance the tag keeps from the edge of the visible area, in CSS px. */
export const TAG_EDGE_MARGIN_PX: 4 = 4;

export function placeCursorTag(caretLine: Box, tag: TagSize, visible: Box, gap: number, margin: number): TagPlacement {
  const aboveTop: number = caretLine.top - gap - tag.height;
  const fitsAbove: boolean = aboveTop >= visible.top + margin;
  const maxLeft: number = visible.right - margin - tag.width;
  const left: number = Math.max(visible.left + margin, Math.min(caretLine.left, maxLeft));
  return fitsAbove
    ? { top: aboveTop, left, side: 'above' }
    : { top: caretLine.bottom + gap, left, side: 'below' };
}
