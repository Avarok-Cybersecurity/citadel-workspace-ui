import { describe, it, expect } from 'vitest';
import { stripWsPrefix } from '../proxy-path';

/**
 * These pin the dev proxy to what production nginx does: `proxy_pass http://<upstream>/` strips the
 * matched `/ws` prefix, so the agent sees `/`. Drift here means dev and production disagree about
 * what reaches the agent, which is the class of bug this change exists to remove.
 */
describe('stripWsPrefix', () => {
  it('turns the bare /ws into /', () => {
    // The case that actually runs: the app connects to `/ws`, and the agent must receive `/`.
    expect(stripWsPrefix('/ws')).toBe('/');
  });

  it('never returns an empty path', () => {
    // An empty request target is not a valid HTTP request line. Without the `|| '/'` fallback the
    // bare-prefix case above would produce exactly that, and the handshake would fail obscurely.
    expect(stripWsPrefix('/ws')).not.toBe('');
  });

  it('preserves a subpath after the prefix', () => {
    expect(stripWsPrefix('/ws/foo')).toBe('/foo');
  });

  it('preserves a query string', () => {
    expect(stripWsPrefix('/ws?token=abc')).toBe('?token=abc');
  });

  it('only strips the prefix at the START of the path', () => {
    // `/proxy/ws` is not a `/ws` request; rewriting it would corrupt an unrelated path.
    expect(stripWsPrefix('/proxy/ws')).toBe('/proxy/ws');
  });

  it('leaves an unrelated path untouched', () => {
    expect(stripWsPrefix('/assets/app.js')).toBe('/assets/app.js');
  });
});
