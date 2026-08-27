/**
 * A write whose success variant is ALSO broadcast to other members must narrow
 * on the payload, or another member's write resolves it.
 *
 * Round 85 gave the server live tree updates by broadcasting `Node`,
 * `NodeDeleted` and `NodeMoved` to everyone. The write gate matches by type,
 * because the protocol carries no request id — so from that moment, any other
 * member's tree write could resolve a pending one here. `awaitWriteResponse`
 * has always taken a `matches` argument for exactly this case; it was passed
 * only for group messages.
 *
 * This scan is what keeps it passed. It is a text scan and knows it: what it
 * proves is that nobody added a broadcast-variant write without narrowing it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';
import { stripComments } from '@/test-utils/strip-comments';

/**
 * Request types whose success variant the server broadcasts. Kept here rather
 * than derived, because the fact lives in the Rust command processor and a
 * derived list would silently shrink if the grep stopped matching.
 */
const BROADCAST_WRITES = new Set(['CreateNode', 'UpdateNode', 'DeleteNode', 'MoveNode']);

const DIR = join(process.cwd(), 'src/lib/workspace-service');

describe('writes whose answer is also broadcast', () => {
  it('all narrow on the payload', async () => {
    const files = await fg(['**/*.ts'], { cwd: DIR, ignore: ['__tests__/**'] });

    const offenders: string[] = [];
    for (const rel of files) {
      const source = stripComments(readFileSync(join(DIR, rel), 'utf-8'));
      for (const match of source.matchAll(/awaitWriteResponse\(\s*'(\w+)'([\s\S]*?)\)\s*;/g)) {
        const [, requestType, rest] = match;
        if (!BROADCAST_WRITES.has(requestType)) continue;
        // Two commas after the type means a third argument was passed.
        if ((rest.match(/,/g) ?? []).length < 2) {
          offenders.push(`${rel}: awaitWriteResponse('${requestType}', …) has no matcher`);
        }
      }
    }

    expect(
      offenders,
      'the server broadcasts this variant to every member, so type alone lets ' +
        "someone else's write resolve this one — and an editor save that resolves " +
        'on a stranger\'s broadcast closes the editor over the user\'s buffer',
    ).toEqual([]);
  });

  it('names request types that actually exist', async () => {
    const gate = readFileSync(join(DIR, 'await-write-response.ts'), 'utf-8');
    for (const requestType of BROADCAST_WRITES) {
      expect(gate, `${requestType} is not a mapped write`).toContain(`${requestType}:`);
    }
  });
});
