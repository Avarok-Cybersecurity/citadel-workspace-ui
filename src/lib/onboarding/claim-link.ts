/**
 * The link in the claim email, read strictly.
 *
 * `/claim#slug=…&code=…&v=…` opens the claim step already filled in; `/claim#slug=…&not-me=…`
 * lets whoever received the email say it was not them. Its secrets are in the fragment, which the
 * browser never sends to a server, so they reach no log and no Referer.
 *
 * Strict, as account-link-params is: exactly one of the two shapes, every value well-formed, or
 * nothing at all. It carries a slug and never a host: the host is this build's own
 * (`workspaceHostFor`), so a doctored link cannot point the claim at someone else's server.
 */
import { checkSlugShape } from './slug';

export type ClaimLink =
  | { readonly kind: 'claim'; readonly slug: string; readonly code: string; readonly token: string }
  | { readonly kind: 'not-me'; readonly slug: string; readonly token: string };

const HEX64: RegExp = /^[0-9a-f]{64}$/;

export function parseClaimLink(fragment: string): ClaimLink | null {
  const params: URLSearchParams = new URLSearchParams(fragment.replace(/^#/, ''));
  const keys: string[] = [...params.keys()];
  if (new Set(keys).size !== keys.length) return null;
  const has = (...names: string[]): boolean => keys.length === names.length && names.every((n: string) => params.has(n));
  const slug: string = params.get('slug') ?? '';
  if (!checkSlugShape(slug).ok) return null;
  if (has('slug', 'code', 'v')) {
    const code: string = params.get('code') ?? '';
    const token: string = params.get('v') ?? '';
    return HEX64.test(code) && HEX64.test(token) ? { kind: 'claim', slug, code, token } : null;
  }
  if (has('slug', 'not-me')) {
    const token: string = params.get('not-me') ?? '';
    return HEX64.test(token) ? { kind: 'not-me', slug, token } : null;
  }
  return null;
}
