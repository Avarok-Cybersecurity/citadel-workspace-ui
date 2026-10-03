/**
 * Whether this workspace asks for a human check (Cloudflare Turnstile) before
 * sign-in and registration, asked of the control plane before the form is used.
 *
 * Discovery FAILS OPEN: no control plane here, an unreachable one or an answer
 * that does not parse all mean "unknown", and the form is shown as usual. The
 * server is what enforces it and fails CLOSED: an `admission_required` refusal
 * reveals the check (refusal.ts). So a broken discovery costs one extra
 * attempt, never a locked-out workspace and never a skipped check.
 */
import type { FetchLike } from '@/lib/onboarding/control-plane-client';

/** Public: the control plane answers it for the workspace this page serves. */
export const ADMISSION_PATH: '/admission' = '/admission';

export interface Admission {
  required: boolean;
  /** Public by design: Turnstile site keys are sent to every visitor. */
  siteKey: string;
}

/** The answer, or null when it is malformed: nothing in it is trusted half-parsed. */
export function parseAdmission(body: unknown): Admission | null {
  if (!body || typeof body !== 'object') return null;
  const turnstile: unknown = (body as Record<string, unknown>).turnstile;
  if (!turnstile || typeof turnstile !== 'object') return null;
  const { required, siteKey } = turnstile as Record<string, unknown>;
  if (typeof required !== 'boolean' || typeof siteKey !== 'string') return null;
  if (required && siteKey.trim().length === 0) return null;
  return { required, siteKey: siteKey.trim() };
}

/** Null when unknown: no control plane, no answer, or an answer that does not parse. */
export async function discoverAdmission(fetchFn: FetchLike, base: string | undefined): Promise<Admission | null> {
  if (base === undefined) return null;
  try {
    const response: Response = await fetchFn(`${base}${ADMISSION_PATH}`, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    return parseAdmission(await response.json());
  } catch {
    // Fail open, on purpose: see the header. The server still refuses without a check.
    return null;
  }
}
