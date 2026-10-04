import { describe, it, expect } from 'vitest';
import { placeCursorTag, TAG_GAP_PX, TAG_EDGE_MARGIN_PX, type Box, type TagPlacement } from '../cursor-tag-placement';

/** Pure geometry: where the name tag goes relative to the caret line. */
const TAG: { width: number; height: number } = { width: 90, height: 22 };
const AREA: Box = { top: 100, bottom: 700, left: 50, right: 650 };
const place = (caret: Box): ReturnType<typeof placeCursorTag> =>
  placeCursorTag(caret, TAG, AREA, TAG_GAP_PX, TAG_EDGE_MARGIN_PX);

describe('placeCursorTag', () => {
  it('puts the tag above the line, clear of the glyphs by the gap', () => {
    const p: TagPlacement = place({ top: 300, bottom: 320, left: 200, right: 202 });
    expect(p.side).toBe('above');
    expect(p.top + TAG.height + TAG_GAP_PX).toBe(300); // its bottom edge is `gap` above the line's top
    expect(p.left).toBe(200);
  });

  it('flips below the line when above would leave the editor', () => {
    const p: TagPlacement = place({ top: 110, bottom: 130, left: 200, right: 202 });
    expect(p.side).toBe('below');
    expect(p.top).toBe(130 + TAG_GAP_PX); // starts `gap` under the line's bottom
  });

  it('stays above exactly when it fits flush against the margin', () => {
    const top: number = AREA.top + TAG_EDGE_MARGIN_PX + TAG.height + TAG_GAP_PX;
    expect(place({ top, bottom: top + 20, left: 200, right: 202 }).side).toBe('above');
    expect(place({ top: top - 1, bottom: top + 19, left: 200, right: 202 }).side).toBe('below');
  });

  it('never overlaps the caret line, above or below', () => {
    for (const lineTop of [100, 112, 140, 300, 690]) {
      const caret: Box = { top: lineTop, bottom: lineTop + 20, left: 300, right: 302 };
      const p: TagPlacement = place(caret);
      const tagBottom: number = p.top + TAG.height;
      const clear: boolean = tagBottom <= caret.top || p.top >= caret.bottom;
      expect(clear).toBe(true);
    }
  });

  it('is clamped inside the area at the right edge', () => {
    const p: TagPlacement = place({ top: 300, bottom: 320, left: 640, right: 642 });
    expect(p.left + TAG.width).toBeLessThanOrEqual(AREA.right - TAG_EDGE_MARGIN_PX);
  });

  it('is clamped inside the area at the left edge', () => {
    expect(place({ top: 300, bottom: 320, left: 10, right: 12 }).left).toBe(AREA.left + TAG_EDGE_MARGIN_PX);
  });
});
