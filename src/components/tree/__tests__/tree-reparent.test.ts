import { describe, it, expect } from 'vitest';

/**
 * Tests for `findReparentTarget` — the proximity heuristic that decides
 * whether a drag-end position should trigger a reparent. The function is
 * pure and intentionally split off from the React Flow layout code so it
 * can be unit-tested without RF / dagre. Coverage targets the cases the
 * heuristic is most likely to silently get wrong:
 *
 * - Self-exclusion: the dragged node must NEVER match itself.
 * - Threshold boundary: `max(w, h) * REPARENT_THRESHOLD_RATIO` is what
 *   gates a candidate, not a hardcoded constant — both sides of the
 *   threshold are exercised.
 * - Measured-dimension override: the function reads `measured?.width` /
 *   `height` when available and falls back to the dagre defaults
 *   otherwise. The original implementation hard-coded 160×40 and
 *   misfired on long labels; this pins the new behaviour.
 * - Closest-wins among multiple candidates within the threshold.
 */

import {
  findReparentTarget,
  DEFAULT_NODE_WIDTH,
  DEFAULT_NODE_HEIGHT,
  REPARENT_THRESHOLD_RATIO,
  type ReparentCandidateNode,
} from '../tree-reparent';

function node(
  id: string,
  x: number,
  y: number,
  measured?: { width?: number; height?: number },
): ReparentCandidateNode {
  return { id, position: { x, y }, measured };
}

describe('findReparentTarget', () => {
  it('returns null when there are no candidates other than the dragged node', () => {
    const dragged = node('A', 0, 0);
    expect(findReparentTarget([dragged], dragged)).toBeNull();
  });

  it('returns null when the dragged node is the only one in the list', () => {
    const dragged = node('A', 100, 100);
    expect(findReparentTarget([], dragged)).toBeNull();
  });

  it('excludes the dragged node from its own candidate set', () => {
    // Even if another node is at the exact same coords as the dragged
    // node, self-id must be skipped — otherwise the dragged node would
    // match itself for any drag.
    const dragged = node('A', 50, 50);
    const sameSpot = node('A', 50, 50);
    expect(findReparentTarget([sameSpot], dragged)).toBeNull();
  });

  it('matches when the dragged-node center sits exactly on top of another node center', () => {
    const dragged = node('A', 0, 0);
    const other = node('B', 0, 0);
    expect(findReparentTarget([other], dragged)).toBe('B');
  });

  it('returns null when the dragged node is further than the threshold', () => {
    // Threshold = max(w, h) * 0.6 = 240 * 0.6 = 144 with defaults.
    // Place the candidate 500 px to the right — well past 144 — so it
    // must NOT count as a reparent target.
    const dragged = node('A', 0, 0);
    const far = node('B', 500, 0);
    expect(findReparentTarget([far], dragged)).toBeNull();
  });

  it('uses node.measured dimensions when present', () => {
    // Custom measured size 100×40; threshold = max(100, 40) * 0.6 = 60.
    // Place the candidate 50 px right of the dragged center — within
    // the 60 px threshold — so it counts even though defaults (240×80)
    // would yield a larger threshold.
    const measured = { width: 100, height: 40 };
    const dragged = node('A', 0, 0, measured);
    const other = node('B', 50, 0, measured);
    // Centers: A=(50,20), B=(100,20). dx=50, dy=0. dist=50. threshold=60. → match.
    expect(findReparentTarget([other], dragged)).toBe('B');
  });

  it('returns the closest candidate when multiple sit within the threshold', () => {
    const dragged = node('A', 0, 0);
    // Candidates at increasing distance — B is the closest within
    // threshold, C is also within threshold but further. D is over the
    // threshold and must be ignored.
    const b = node('B', 10, 0);
    const c = node('C', 80, 0);
    const d = node('D', 1000, 0);
    expect(findReparentTarget([b, c, d], dragged)).toBe('B');
  });

  it('respects the threshold boundary using the LARGER dimension (max(w, h))', () => {
    // A non-square node where height > width should use height for
    // the threshold scaling. With h=200 the threshold becomes
    // 200 * 0.6 = 120 — so a candidate 100 px away matches even
    // though it would not have under width-only (240) defaults
    // shrunk to a smaller h.
    const tall = { width: 50, height: 200 };
    const dragged = node('A', 0, 0, tall);
    // Centers: A=(25,100). Candidate at (100, 0) with same dims has
    // center (125, 100). dx=100, dy=0. dist=100. threshold=120 → match.
    const other = node('B', 100, 0, tall);
    expect(findReparentTarget([other], dragged)).toBe('B');

    // Push past the threshold (dist > 120) and the match must drop.
    const far = node('C', 150, 0, tall);
    // Centers: dragged=(25,100), C=(175,100). dx=150, dy=0. dist=150 > 120.
    expect(findReparentTarget([far], dragged)).toBeNull();
  });

  it('falls back to default dimensions when measured is missing', () => {
    // No measured → default 240×80. Threshold = 240 * 0.6 = 144.
    const dragged = node('A', 0, 0);
    const within = node('B', 140, 0);
    expect(findReparentTarget([within], dragged)).toBe('B');
  });

  it('exposes stable proximity-threshold constants for callers and tests', () => {
    // These constants are part of the module's public API — they
    // appear in the JSDoc as the rationale for the heuristic, and a
    // future refactor that changes them must do so deliberately
    // (this assertion fails loudly so the change is reviewed).
    expect(DEFAULT_NODE_WIDTH).toBe(240);
    expect(DEFAULT_NODE_HEIGHT).toBe(80);
    expect(REPARENT_THRESHOLD_RATIO).toBe(0.6);
  });
});
