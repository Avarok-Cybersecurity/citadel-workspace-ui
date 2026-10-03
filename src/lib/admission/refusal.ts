/**
 * The server's two admission refusals, carried as `reason_code` on a
 * ConnectFailure or RegisterFailure.
 *
 * - `admission_required`: this workspace needs a human check and none came.
 * - `admission_failed`: a check came and did not verify (failed, expired, or a
 *   token already spent: each one is single-use).
 */
export type AdmissionReason = 'admission_required' | 'admission_failed';

const REASONS: ReadonlySet<string> = new Set<string>(['admission_required', 'admission_failed'] satisfies AdmissionReason[]);

export function admissionReasonOf(payload: Record<string, unknown> | undefined): AdmissionReason | null {
  const code: unknown = payload?.reason_code;
  return typeof code === 'string' && REASONS.has(code) ? (code as AdmissionReason) : null;
}

/** A refusal the form answers by showing or resetting the check, not by a generic error. */
export class AdmissionRefusal extends Error {
  readonly reason: AdmissionReason;
  constructor(reason: AdmissionReason, message: string) {
    super(message);
    this.name = 'AdmissionRefusal';
    this.reason = reason;
  }
}

export const isAdmissionRefusal = (error: unknown): error is AdmissionRefusal => error instanceof AdmissionRefusal;
