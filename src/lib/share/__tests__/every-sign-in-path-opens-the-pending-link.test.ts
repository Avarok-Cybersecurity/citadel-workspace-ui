/**
 * Every way into the workspace opens the secure link the visitor arrived with, through the one
 * resolver: the landing page's join and sign-in, the connect page, the switch to an existing
 * session, and the workspace loader. Read from the source, because each of these is a whole page
 * driven by a live session; the resolver's behaviour is tested on its own
 * (resolve-pending-redirect.test.ts). A path that went straight to /workspace again would drop
 * the link silently, which is the failure this guards.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC: string = resolve(__dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(SRC, path), 'utf8');
const IMPORT: RegExp = /import \{ resolvePendingRedirect \} from '@\/lib\/share\/resolve-here';/;
const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length;

describe('the post-sign-in paths', () => {
  it.each([
    ['pages/Landing.tsx', 1],
    ['pages/Connect.tsx', 1],
    ['components/login-session-redirect.ts', 1],
  ])('%s resolves the pending link where it used to go to /workspace', (file: string, calls: number) => {
    const text: string = read(file);
    expect(text).toMatch(IMPORT);
    expect(count(text, /await resolvePendingRedirect\(navigate, getWorkspacePath\(\)\)/g)).toBe(calls);
    expect(text).not.toMatch(/navigate\(getWorkspacePath\(\)\)/);
  });

  it('the landing page sends both join and sign-in through it', () => {
    const text: string = read('pages/Landing.tsx');
    expect(text).toMatch(/handleJoinNext[^\n]*= finishAuth\(/);
    expect(text).toMatch(/handleLoginNext[^\n]*= finishAuth\(/);
    expect(text).toMatch(/usePendingRedirectSignIn\(startLogin, setServerAddress\)/);
  });

  it('the workspace loader opens it once the workspace is ready, and goes nowhere otherwise', () => {
    const text: string = read('components/ui/workspace-loader.tsx');
    expect(text).toMatch(IMPORT);
    expect(text).toMatch(/view\.kind === 'ready'\) void resolvePendingRedirect\(navigate, null\)/);
  });

  it('boot captures the link before anything renders', () => {
    const text: string = read('main.tsx');
    const capture: number = text.indexOf('capturePendingRedirect(window.location.search');
    expect(capture).toBeGreaterThan(-1);
    expect(capture).toBeLessThan(text.indexOf('root.render('));
  });
});
