import { describe, it, expect } from 'vitest';
import { ancestorIds, type AncestorWalkable } from '../ancestor-chain';

function node(id: string, children: AncestorWalkable[] = []): AncestorWalkable {
  return { node: { id }, children };
}

/** The shape the hierarchy suite builds: five levels, one child each. */
const DEEP: AncestorWalkable = node('root', [
  node('alpha', [node('beta', [node('charlie', [node('delta', [node('epsilon')])])])]),
]);

describe('the ancestors of a node', () => {
  it('names every level above it, not just its parent', () => {
    expect(ancestorIds(DEEP, 'epsilon')).toEqual(['root', 'alpha', 'beta', 'charlie', 'delta']);
  });

  it('is empty for the root, which has nothing to open', () => {
    expect(ancestorIds(DEEP, 'root')).toEqual([]);
  });

  it('is empty for a node this tree does not contain', () => {
    // Not an error: a node:loaded for another workspace's tree is ordinary.
    expect(ancestorIds(DEEP, 'somewhere-else')).toEqual([]);
  });

  it('is empty when there is no tree yet', () => {
    expect(ancestorIds(null, 'epsilon')).toEqual([]);
  });

  it('finds a node down the second branch, not only the first', () => {
    const forked: AncestorWalkable = node('root', [
      node('a', [node('a1')]),
      node('b', [node('b1', [node('b2')])]),
    ]);
    expect(ancestorIds(forked, 'b2')).toEqual(['root', 'b', 'b1']);
  });
});
