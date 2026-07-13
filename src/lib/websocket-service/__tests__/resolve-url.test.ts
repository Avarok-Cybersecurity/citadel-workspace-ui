import { describe, it, expect } from 'vitest';
import { resolveWebsocketUrl } from '../resolve-url';

/**
 * The browser reaches the local Citadel agent over exactly one URL, decided here. Get this wrong
 * and the app cannot connect at all - so the precedence and the scheme mapping are pinned.
 */
describe('resolveWebsocketUrl', () => {
  const http = { protocol: 'http:', host: 'localhost:8080' };
  const https = { protocol: 'https:', host: 'workspace.example.com' };

  it('defaults to a SAME-ORIGIN /ws path', () => {
    // This is the whole point: the production CSP is `connect-src 'self'`, so an off-origin
    // socket (the old `ws://localhost:12345`) is blocked by the browser outright.
    expect(resolveWebsocketUrl(undefined, undefined, http)).toBe('ws://localhost:8080/ws');
  });

  it('uses wss when the page is served over TLS', () => {
    // A page on https cannot open a plain `ws://` socket - browsers treat it as mixed content and
    // block it. Following the page scheme is what makes one build work on both.
    expect(resolveWebsocketUrl(undefined, undefined, https)).toBe('wss://workspace.example.com/ws');
  });

  it('carries the port through, since host includes it', () => {
    expect(resolveWebsocketUrl(undefined, undefined, { protocol: 'http:', host: '127.0.0.1:5291' }))
      .toBe('ws://127.0.0.1:5291/ws');
  });

  it('honours VITE_WS_URL over the same-origin default', () => {
    // Existing hosted deployments bake an absolute URL at build time. They must keep working
    // unchanged, so the build-time value still wins over the derived default.
    expect(resolveWebsocketUrl(undefined, 'wss://hosted.example.com/ws', http))
      .toBe('wss://hosted.example.com/ws');
  });

  it('honours an explicit config URL over everything', () => {
    expect(resolveWebsocketUrl('ws://explicit:1234', 'wss://build-time/ws', https))
      .toBe('ws://explicit:1234');
  });

  it('ignores empty-string overrides rather than emitting a broken URL', () => {
    // An unset `VITE_WS_URL` reaches Vite as `''`, not `undefined`. Treating that as "configured"
    // would hand the WebSocket an empty URL and fail at connect time with a useless error.
    expect(resolveWebsocketUrl('', '', http)).toBe('ws://localhost:8080/ws');
  });
});
