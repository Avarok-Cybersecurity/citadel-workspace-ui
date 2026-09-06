import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every way into a flow that needs the agent must consult the agent's health.
 *
 * The landing screen has two buttons side by side. Round 635 guarded "Create
 * Account" -- `useOnboardingIntent` refuses to open while the agent is
 * unreachable -- and left "Sign In" untouched, so the fix was applied to one of
 * the two places its own reasoning covered. That reasoning ("the retry dialog
 * has to win: it alone carries the download links and the run command") is
 * about the SCREEN, not about registration.
 *
 * Unguarded, a visitor with no agent gets the sign-in card (`fixed inset-0
 * z-50`, its own focus trap), then ConnectionRetryModal on top, OfflineBanner
 * above, and after typing credentials "Connection timeout, check your network"
 * -- which names neither the agent nor the fix.
 *
 * Read as source rather than rendered because the property is "no entry point
 * is missing the check". Rendering proves things about the paths a test
 * remembers to exercise; the omission that caused this was a path nobody
 * thought to exercise, which is exactly what a render test cannot see. The two
 * behavioural halves ARE covered by rendering, in
 * `src/hooks/__tests__/onboarding-waits-for-the-agent.test.tsx`.
 */
const LANDING: string = readFileSync(
  join(process.cwd(), 'src', 'pages', 'Landing.tsx'),
  'utf8',
);

/** Strip comments: the explanation of a guard is not a guard. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

describe('the landing screen and the agent', () => {
  const body: string = code(LANDING);

  it('reads the agent health signal', () => {
    expect(body).toMatch(/useServiceHealth\s*\(/);
    expect(body).toMatch(/isHealthy/);
  });

  it('refuses to open the sign-in flow while the agent is unreachable', () => {
    const startLogin: RegExpMatchArray | null = body.match(
      /const\s+startLogin[^=]*=\s*\([^)]*\)\s*(?::[^=]*)?=>\s*\{([\s\S]*?)\n\s{2}\}/,
    );
    expect(startLogin).not.toBeNull();
    // The guard must be inside the handler, not merely somewhere in the file.
    expect(startLogin![1]).toMatch(/!isHealthy/);
  });

  it('closes the sign-in flow if the agent goes away while it is open', () => {
    expect(body).toMatch(/step === 'login'/);
  });

  it('routes account creation through the health-guarded hook', () => {
    // The other door. Named here so removing EITHER guard fails this file,
    // rather than each being pinned in a place the other's author never opens.
    expect(body).toMatch(/useOnboardingIntent\s*\(/);
    // `[^=]*` cannot cross the `=` in the annotation `: () => void`, which is
    // how this assertion first failed against correct code.
    expect(body).toMatch(/startRegistration[\s\S]{0,40}?=\s*intent\.request/);
  });

  it('reads a Landing.tsx that actually has both buttons', () => {
    // Floor. Every assertion above is over a string; if the file moved or the
    // read returned something unexpected, they would all pass or all fail for
    // reasons unrelated to the guards.
    expect(LANDING.length).toBeGreaterThan(2000);
    expect(LANDING).toContain('create-account-button');
    expect(LANDING).toContain('Sign In');
  });
});
