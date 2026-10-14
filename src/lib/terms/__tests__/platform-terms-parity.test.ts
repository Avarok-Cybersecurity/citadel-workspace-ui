/**
 * The terms the wizard shows before sign-in are the server's. Reads the Rust crate's text and
 * version straight from the parent checkout (CI runs from the parent). Standalone submodule
 * checkouts have no parent to compare with, so only there is the comparison skipped.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOWN_PLATFORM_TERMS_TEXT, SHOWN_PLATFORM_TERMS_VERSION } from '../platform-terms';

const TYPES: string = join(process.cwd(), '..', 'citadel-workspace-types', 'src');
const present: boolean = existsSync(join(TYPES, 'terms.rs'));

describe('the platform terms shown before sign-in', () => {
  it.skipIf(!present)('are the server\'s text', () => {
    expect(SHOWN_PLATFORM_TERMS_TEXT).toBe(readFileSync(join(TYPES, 'platform_terms.md'), 'utf8'));
  });
  it.skipIf(!present)('name the server\'s version', () => {
    const rust: string = readFileSync(join(TYPES, 'terms.rs'), 'utf8');
    const version: RegExpMatchArray | null = rust.match(/PLATFORM_TERMS_VERSION: u32 = (\d+);/);
    expect(version).not.toBeNull();
    expect(SHOWN_PLATFORM_TERMS_VERSION).toBe(Number(version?.[1]));
  });
});
