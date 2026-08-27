/**
 * `debugLog` becomes a `noop` in production — but the call sites remain and
 * THEIR ARGUMENTS ARE STILL EVALUATED. With 1,000-plus of them that is several
 * KB on a phone's first paint, and worse than dead bytes: one call recursively
 * stringifies the serialized session store on every write, in production, to
 * feed a function that throws the result away.
 *
 * esbuild's `pure` list is what lets the minifier drop the call and its
 * arguments together. The list is comment-stripped before matching because the
 * config now explains `debugLog` in prose — an assertion that matched the
 * explanation would pass on a config that had lost the entry.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@/test-utils/strip-comments';

const config = stripComments(readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8'));

/** The `pure: [...]` array as written, comments already removed. */
const pureList = /pure:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';

describe('production logging', () => {
  it('marks debugLog pure so its calls and arguments are removable', () => {
    expect(pureList, 'the pure list is gone from vite.config.ts').not.toBe('');
    expect(pureList).toContain("'debugLog'");
  });

  it('does NOT mark errorLog or warnLog pure', () => {
    // A render crash is the one error a user cannot report themselves, so it
    // must survive minification.
    expect(pureList).not.toContain('errorLog');
    expect(pureList).not.toContain('warnLog');
    expect(pureList).not.toContain('console.error');
    expect(pureList).not.toContain('console.warn');
  });

  it('keeps debugLog a no-op at runtime as well', () => {
    // Belt and braces: `pure` only helps the production build. The runtime
    // guard is what makes a dev-only log dev-only in every other context.
    const source = readFileSync(join(process.cwd(), 'src/lib/debug-config.ts'), 'utf8');
    expect(source).toMatch(/isDev\s*\?/);
    expect(source).toContain('noop');
  });
});
