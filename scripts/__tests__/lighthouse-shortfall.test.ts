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
import { shortfallIsExpected } from '../lighthouse-shortfall.mjs';

const category = (ids: string[]) => ({ auditRefs: ids.map((id) => ({ id })) });
const audit = (id: string, score: number, messages: string[] = []) => [
  id,
  { id, score, details: { items: messages.map((description) => ({ description })) } },
];

/** valid-source-maps reports script URLs, not messages. */
const maps = (urls: string[]) => [
  'valid-source-maps',
  { id: 'valid-source-maps', score: 0, details: { items: urls.map((scriptUrl) => ({ scriptUrl })) } },
];

/** inspector-issues reports a table of issueType, not messages. */
const issues = (types: string[]) => [
  'inspector-issues',
  { id: 'inspector-issues', score: 0, details: { items: types.map((issueType) => ({ issueType })) } },
];

const ABSENT_AGENT =
  'Failed to initialize WASM client: WebSocket connection failed: ConnectionFailed { event: CloseEvent { code: 1006 } }';

describe('shortfallIsExpected', () => {
  it('accepts the shortfall CI actually reports', () => {
    expect(
      shortfallIsExpected(
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
      shortfallIsExpected(
        category(['errors-in-console']),
        Object.fromEntries([
          audit('errors-in-console', 0, [ABSENT_AGENT, 'TypeError: cannot read x of undefined']),
        ]),
      ),
    ).toBe(false);
  });

  it('rejects a second failing audit', () => {
    expect(
      shortfallIsExpected(
        category(['errors-in-console', 'deprecations']),
        Object.fromEntries([audit('errors-in-console', 0, [ABSENT_AGENT]), audit('deprecations', 0, [])]),
      ),
    ).toBe(false);
  });

  it('accepts the real pair CI reports: absent agent plus the CSP eval probe', () => {
    // What actually failed the build: requiring errors-in-console to be the
    // ONLY failing audit was too narrow, because cbor-x's `new Function` probe
    // trips inspector-issues on every run as well.
    expect(
      shortfallIsExpected(
        category(['errors-in-console', 'inspector-issues']),
        Object.fromEntries([
          audit('errors-in-console', 0, [ABSENT_AGENT]),
          issues(['Content security policy']),
        ]),
      ),
    ).toBe(true);
  });

  it('accepts a source-map miss on our own assets', () => {
    // Lighthouse FETCHES each map, so under load it reports missing against a
    // build whose maps are correct. check-source-maps.mjs is the deterministic
    // guard; this only stops the flaky version reddening the build.
    expect(
      shortfallIsExpected(
        category(['valid-source-maps']),
        Object.fromEntries([maps(['http://localhost:4173/assets/app-services-x.js'])]),
      ),
    ).toBe(true);
  });

  it('rejects a source-map miss on a third-party script', () => {
    expect(
      shortfallIsExpected(
        category(['valid-source-maps']),
        Object.fromEntries([maps(['https://cdn.example.com/thing.js'])]),
      ),
    ).toBe(false);
  });

  it('accepts all three known audits together, as CI reports them', () => {
    expect(
      shortfallIsExpected(
        category(['errors-in-console', 'valid-source-maps', 'inspector-issues']),
        Object.fromEntries([
          audit('errors-in-console', 0, [ABSENT_AGENT]),
          maps(['http://localhost:4173/wasm/client_bg.wasm']),
          issues(['Content security policy']),
        ]),
      ),
    ).toBe(true);
  });

  it('rejects an inspector issue that is not the policy', () => {
    expect(
      shortfallIsExpected(
        category(['errors-in-console', 'inspector-issues']),
        Object.fromEntries([
          audit('errors-in-console', 0, [ABSENT_AGENT]),
          issues(['Content security policy', 'Mixed content']),
        ]),
      ),
    ).toBe(false);
  });

  it('rejects inspector-issues that reports nothing identifiable', () => {
    expect(
      shortfallIsExpected(
        category(['inspector-issues']),
        Object.fromEntries([issues([])]),
      ),
    ).toBe(false);
  });

  it('rejects a different failing audit on its own', () => {
    expect(
      shortfallIsExpected(
        category(['deprecations']),
        Object.fromEntries([audit('deprecations', 0, ['some deprecation'])]),
      ),
    ).toBe(false);
  });

  it('excuses nothing when nothing is failing', () => {
    expect(
      shortfallIsExpected(
        category(['errors-in-console']),
        Object.fromEntries([audit('errors-in-console', 1, [])]),
      ),
    ).toBe(false);
  });

  it('rejects a failing errors-in-console that carries no messages to check', () => {
    expect(
      shortfallIsExpected(
        category(['errors-in-console']),
        Object.fromEntries([audit('errors-in-console', 0, [])]),
      ),
    ).toBe(false);
  });
});
