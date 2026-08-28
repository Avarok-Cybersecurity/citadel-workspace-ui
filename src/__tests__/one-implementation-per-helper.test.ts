/**
 * Helpers that had drifted, and must not fork again.
 *
 * Each name here existed in two to four places, and in three cases the copies
 * already disagreed:
 *
 *   formatBytes / formatSize / formatFileSize
 *     four implementations, three precisions. A transfer bubble said "1.5 MB"
 *     and the progress line beside it said "1.46 MB" about the same file.
 *
 *   findNodeByPath
 *     three byte-identical copies, two of them exported from neighbouring
 *     files in the same directory and imported by their neighbours.
 *
 *   toInternalServiceRequest
 *     twice, with the same body AND the same doc comment. It is the blessed
 *     cast across the WASM nominal-type boundary, so it should exist once
 *     precisely so a grep finds every crossing point.
 *
 * A re-export is fine — several modules keep their old name as a front. What
 * this forbids is a second BODY.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';
import { stripComments } from '@/test-utils/strip-comments';

const SRC = join(process.cwd(), 'src');

/** name -> the single file allowed to define it. */
const CANONICAL: Record<string, string> = {
  formatBytes: 'lib/format-bytes.ts',
  findNodeByPath: 'lib/revfs/find-node-by-path.ts',
  toInternalServiceRequest: 'lib/wasm-request.ts',
};

describe('a shared helper', () => {
  it('is defined once', async () => {
    const files = await fg(['**/*.ts', '**/*.tsx'], {
      cwd: SRC,
      ignore: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', 'test-utils/**'],
    });

    const offenders: string[] = [];

    for (const rel of files) {
      const source = stripComments(readFileSync(join(SRC, rel), 'utf-8'));

      for (const [name, home] of Object.entries(CANONICAL)) {
        if (rel === home) continue;
        // A definition, not a re-export or a call: `function name(` in any of
        // the forms this codebase uses.
        const defines = new RegExp(
          `(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b|` +
            `(?:export\\s+)?const\\s+${name}\\s*[:=]\\s*(?:\\([^)]*\\)|async)`,
        );
        if (defines.test(source)) offenders.push(`${rel} redefines ${name} (home: ${home})`);
      }
    }

    expect(
      offenders,
      'this helper already forked once and the copies disagreed. Import it, or ' +
        're-export it under the old name — do not write a second body.',
    ).toEqual([]);
  });

  it('keeps every canonical home real', () => {
    // A home that no longer defines the thing would silently make the rule
    // above vacuous for that name.
    for (const [name, home] of Object.entries(CANONICAL)) {
      const source = stripComments(readFileSync(join(SRC, home), 'utf-8'));
      expect(
        new RegExp(`function\\s+${name}\\b`).test(source),
        `${home} is named as the home of ${name} but does not define it`,
      ).toBe(true);
    }
  });
});
