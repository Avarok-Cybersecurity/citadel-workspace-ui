/**
 * Path rewriting for the local `/ws` dev proxy.
 *
 * This exists as a tested module rather than an inline arrow in vite.config.ts because of what it
 * is FOR: keeping the local dev/preview servers byte-identical to production at the agent boundary.
 * Production nginx uses `proxy_pass http://<upstream>/`, whose trailing slash strips the matched
 * `/ws` prefix, so the agent sees `/`. Vite must send the same thing.
 *
 * If that silently drifts, dev and production disagree about what reaches the agent - and a
 * dev/production divergence is exactly how the CSP bug this whole change fixes stayed invisible for
 * so long (dev's laxer policy allowed an off-origin socket, production's did not, and nothing
 * exercised the production path). Leaving the one piece of parity logic untested would repeat that
 * mistake in miniature.
 */

/**
 * Strip the `/ws` prefix a request arrived on, yielding the path to forward to the agent.
 *
 * `/ws` -> `/`, `/ws/foo` -> `/foo`. Never returns an empty string: an empty request target is not
 * a valid HTTP request line, so the bare-prefix case falls back to `/`.
 */
export function stripWsPrefix(path: string): string {
  return path.replace(/^\/ws/, '') || '/';
}
