/**
 * Every module that reads LocalDB and catches must tell absent from failed.
 *
 * `sendLocalDBGet` rejects for BOTH "no such key" and "the socket is down". A
 * catch that treats them alike returns the same answer for "nothing is stored"
 * and "I could not find out" — and upstream, those answers mean very different
 * things:
 *
 *  - no stored sessions → the reconnect machinery sends the user to the landing
 *    page. A failed read does that to somebody with a live session.
 *  - no such document → reported as "this document does not exist".
 *  - default preference → silently turns auto-connect back on for somebody who
 *    turned it off.
 *
 * Round 265 unified the PREDICATE and added a test refusing a fifth copy of the
 * string. That guard could not see this: `connection/session-management` never
 * tested the string at all — it caught everything into one line — so nothing
 * flagged it, and CI printed
 *
 *   [ConnectionService] Failed to load stored sessions Error: Key not found
 *
 * on every boot for weeks. A guard against copies of a fix is not a guard
 * against the absence of one.
 *
 * The allow-list is the point: a module lands on it by somebody deciding it
 * belongs there and writing down why, not by nobody noticing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';

const SRC: string = join(process.cwd(), 'src');

/**
 * Reads LocalDB, catches, and does not classify — with the reason why.
 *
 * `peer-registration-store/persistence.ts` was on this list with the reason
 * "its catches wrap sendMessage rejections on the WRITE path, where absence is
 * not a state". That was simply false: the catch and the reject callback it
 * named are both on the READ path, and both resolved as though the key held
 * nothing. Two pending contact requests could be erased by one timeout. An
 * exemption is a claim about the code, and this one was never true.
 *
 * Known limit, stated here rather than discovered later: `classifies` below is
 * a whole-FILE test. A module where one function classifies and another does
 * not passes. `live-document-store/persistence.ts` is exactly that shape today.
 */
const EXEMPT: Record<string, string> = {
  'lib/connection/io-websocket.ts':
    'its one catch is around JSON decoding of a value already read, not the read',
  'lib/peer-registration-store/service.ts':
    'catches around accept/decline requests, not around a read',
};

function readsLocalDb(source: string): boolean {
  return /sendLocalDBGet|localDBGet\(|FromLocalDB\(/.test(source);
}

describe('a module that reads LocalDB', () => {
  it('tells an absent key from a failed read, or says why it need not', async () => {
    const files: string[] = await fg(['**/*.ts', '**/*.tsx'], {
      cwd: SRC,
      ignore: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    });

    const offenders: string[] = [];
    const staleExemptions: string[] = [];

    for (const rel of files) {
      const source: string = readFileSync(join(SRC, rel), 'utf-8');
      if (!readsLocalDb(source)) continue;
      if (!/catch\s*\(/.test(source)) continue;

      const classifies: boolean = source.includes('isGenuinelyAbsent');
      if (classifies && rel in EXEMPT) staleExemptions.push(rel);
      if (!classifies && !(rel in EXEMPT)) offenders.push(rel);
    }

    expect(
      offenders,
      'import isGenuinelyAbsent from lib/storage/absence and say which case you ' +
        'are in, or add the module to EXEMPT with the reason it does not need to.',
    ).toEqual([]);

    expect(
      staleExemptions,
      'these classify now, so their exemption is stale — remove it, or the list ' +
        'stops meaning anything.',
    ).toEqual([]);
  });
});
