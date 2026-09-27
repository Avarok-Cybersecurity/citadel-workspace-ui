/**
 * No sentence the app shows names "offices" or "rooms" outright.
 *
 * The hierarchy is the workspace's own (Division → Team, or anything else), so words for its
 * levels come from its schema: `getEntityMetadata(type).label`, or `levelsPhrase()` for the
 * levels in general. A hard-coded "offices and rooms" is wrong for every workspace organised any
 * other way, and nothing else would notice.
 *
 * What it checks: string literals and template text containing a space (so testids, import
 * paths and identifiers are not sentences), in production sources, comments stripped.
 * What it cannot see: a sentence assembled from fragments that each lack the word.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments } from '@/test-utils/strip-comments';

const SRC: string = join(process.cwd(), 'src');
const LEVEL_WORD: RegExp = /\b(offices?|rooms?)\b/i;
const STRINGS: RegExp = /'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g;

/** Allowed, each with why. */
const EXEMPT: Record<string, string> = {
  // The template catalogue is written for the default levels; its names and bodies describe an
  // office page and a room page. Offering templates per level is the follow-up.
  'lib/mdx-templates/office-templates.ts': 'template content for the default Office level',
  'lib/mdx-templates/room-templates.ts': 'template content for the default Room level',
  'lib/mdx-templates/superseded.ts': 'hashes and ids of the old default templates',
  'lib/mdx-templates/types.ts': 'template category ids',
  'lib/mdx-templates/index.ts': 'template category ids',
  // "Room to grow" is English, not a level.
  'lib/onboarding/tiers.ts': 'the idiom "room to grow"',
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full: string = join(dir, name);
    if (name === '__tests__' || name === 'test' || name === 'test-utils') return [];
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Sentences in `source` that name a level outright. */
export function hardCodedLevelWords(source: string): string[] {
  const found: string[] = [];
  for (const m of stripComments(source).matchAll(STRINGS)) {
    const text: string = m[1] ?? m[2] ?? m[3] ?? '';
    // "[Office] Navigating…" is a debug log line, never shown to anyone.
    if (text.includes(' ') && LEVEL_WORD.test(text) && !/^\[[A-Za-z]+\]/.test(text)) found.push(text.trim().slice(0, 80));
  }
  return found;
}

describe('the words for the levels', () => {
  it('can tell a sentence from an identifier (the check itself)', () => {
    expect(hardCodedLevelWords("const a = 'Add offices and rooms';")).toHaveLength(1);
    expect(hardCodedLevelWords('const t = `Delete this room now`;')).toHaveLength(1);
    expect(hardCodedLevelWords("data-testid='office-save-content' import('@/components/Office')")).toEqual([]);
    expect(hardCodedLevelWords("debugLog('[Office] Navigating to room r1')")).toEqual([]);
  });

  it('come from the schema, not from the source', () => {
    const offenders: string[] = sources(SRC)
      .map((file: string) => relative(SRC, file))
      .filter((rel: string) => !(rel in EXEMPT))
      .flatMap((rel: string) => hardCodedLevelWords(readFileSync(join(SRC, rel), 'utf8')).map((s: string) => `${rel}: ${s}`));
    expect(offenders, 'use getEntityMetadata(type).label or levelsPhrase()').toEqual([]);
  });

  it('exempt only files that exist', () => {
    const files: Set<string> = new Set<string>(sources(SRC).map((f: string) => relative(SRC, f)));
    expect(Object.keys(EXEMPT).filter((rel: string) => !files.has(rel))).toEqual([]);
  });
});
