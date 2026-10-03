/**
 * The workspace server's admission check, for the fake agent: a workspace that
 * requires a human check refuses a Connect or Register without a valid token,
 * and a token works once (Turnstile's siteverify rejects a spent one).
 *
 * "Valid" is what the fake widget issues for Cloudflare's always-pass TEST
 * site key; nothing here talks to Cloudflare.
 */
export const FAKE_TOKEN_PREFIX: 'XXXX.DUMMY.TOKEN.' = 'XXXX.DUMMY.TOKEN.';

export class FakeAdmission {
  required: boolean = false;
  readonly spent: Set<string> = new Set<string>();

  /** The refusal's reason_code, or null to let the request through. */
  check(token: unknown): 'admission_required' | 'admission_failed' | null {
    if (!this.required) return null;
    if (token === null || token === undefined) return 'admission_required';
    if (typeof token !== 'string' || !token.startsWith(FAKE_TOKEN_PREFIX) || this.spent.has(token)) return 'admission_failed';
    this.spent.add(token);
    return null;
  }
}
