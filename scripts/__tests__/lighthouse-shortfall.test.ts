/**
 * The predicate that decides whether CI's best-practices shortfall is the one
 * known, expected condition — or a real problem.
 *
 * Worth testing directly because the condition it describes is awkward to
 * reproduce on demand: it depends on the agent being absent AND the failure
 * surfacing inside Lighthouse's collection window. Pointing the proxy at a dead
 * port locally did NOT reproduce it — the audit finished first and scored 96 —
 * so a browser-driven check here would have proved nothing while looking green.
 */

import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs helper shared with the CI script, no types.
import { shortfallIsOnlyTheAbsentAgent } from '../lighthouse-shortfall.mjs';

const category = (ids: string[]) => ({ auditRefs: ids.map((id) => ({ id })) });
const audit = (id: string, score: number, messages: string[] = []) => [
  id,
  { id, score, details: { items: messages.map((description) => ({ description })) } },
];

const ABSENT_AGENT =
  'Failed to initialize WASM client: WebSocket connection failed: ConnectionFailed { event: CloseEvent { code: 1006 } }';

describe('shortfallIsOnlyTheAbsentAgent', () => {
  it('accepts the shortfall CI actually reports', () => {
    expect(
      shortfallIsOnlyTheAbsentAgent(
        category(['errors-in-console']),
        Object.fromEntries([
          audit('errors-in-console', 0, [ABSENT_AGENT, 'Connection error: Failed to initialize WASM client']),
        ]),
      ),
    ).toBe(true);
  });

  it('rejects a console error that is not the absent agent', () => {
    // The point of the whole predicate: a real error hiding among expected ones.
    expect(
      shortfallIsOnlyTheAbsentAgent(
        category(['errors-in-console']),
        Object.fromEntries([
          audit('errors-in-console', 0, [ABSENT_AGENT, 'TypeError: cannot read x of undefined']),
        ]),
      ),
    ).toBe(false);
  });

  it('rejects a second failing audit', () => {
    expect(
      shortfallIsOnlyTheAbsentAgent(
        category(['errors-in-console', 'deprecations']),
        Object.fromEntries([audit('errors-in-console', 0, [ABSENT_AGENT]), audit('deprecations', 0, [])]),
      ),
    ).toBe(false);
  });

  it('rejects a different failing audit on its own', () => {
    expect(
      shortfallIsOnlyTheAbsentAgent(
        category(['deprecations']),
        Object.fromEntries([audit('deprecations', 0, ['some deprecation'])]),
      ),
    ).toBe(false);
  });

  it('excuses nothing when nothing is failing', () => {
    expect(
      shortfallIsOnlyTheAbsentAgent(
        category(['errors-in-console']),
        Object.fromEntries([audit('errors-in-console', 1, [])]),
      ),
    ).toBe(false);
  });

  it('rejects a failing errors-in-console that carries no messages to check', () => {
    expect(
      shortfallIsOnlyTheAbsentAgent(
        category(['errors-in-console']),
        Object.fromEntries([audit('errors-in-console', 0, [])]),
      ),
    ).toBe(false);
  });
});
