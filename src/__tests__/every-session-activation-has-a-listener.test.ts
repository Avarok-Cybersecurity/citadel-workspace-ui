/**
 * Every module that emits 'session:activated' loads the service that listens for it.
 *
 * SessionStartupService subscribes when its module is first imported. Only the
 * register path and a workspace-sidebar hook imported it, so a password sign-in
 * from a freshly loaded landing page emitted the event to nobody: the P2P
 * registry never started, and presence read "not known" for every member
 * (live, admin-lab, 2026-09-25). The emitter carries the import, so the
 * listener exists wherever the event can be raised.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';
import { stripComments } from '@/test-utils/strip-comments';

const SRC: string = join(__dirname, '..');
/** The listener itself re-emits to queue a reconnection behind a running startup. */
const LISTENER: string = 'lib/session-startup-service.ts';
const EMITS: RegExp = /emit\(\s*['"]session:activated['"]/;
const LOADS_LISTENER: RegExp = /import\s+(?:[^'"]*from\s+)?['"]@\/lib\/session-startup-service['"]/;

describe("the 'session:activated' listener", () => {
  const emitters: string[] = fg.sync('**/*.{ts,tsx}', { cwd: SRC, ignore: ['**/__tests__/**', '**/*.test.*', LISTENER] })
    .filter((file: string): boolean => EMITS.test(stripComments(readFileSync(join(SRC, file), 'utf8'))));

  it('has emitters to check', () => {
    expect(emitters.length).toBeGreaterThan(0);
  });

  it('is imported by every module that emits the event', () => {
    const missing: string[] = emitters.filter(
      (file: string): boolean => !LOADS_LISTENER.test(readFileSync(join(SRC, file), 'utf8')),
    );
    expect(missing).toEqual([]);
  });
});
