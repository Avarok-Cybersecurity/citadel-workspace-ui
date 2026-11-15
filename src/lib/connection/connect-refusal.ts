/**
 * A refused Connect as the error the sign-in forms act on: the agent's wrong-server
 * refusal (sign-in-server.ts), the server's admission refusal (shown on the check),
 * or the plain message.
 */
import { AdmissionRefusal, admissionReasonOf, type AdmissionReason } from '@/lib/admission/refusal';
import { signInServerReasonOf, SignInServerRefusal, type SignInServerReason } from '@/lib/sessions/sign-in-server';
import type { ConnectOutcome } from './await-connect-outcome';

export function connectRefusal(outcome: Extract<ConnectOutcome, { kind: 'failed' }>, username: string): Error {
  const wrongServer: SignInServerReason | null = signInServerReasonOf(outcome.reasonCode);
  if (wrongServer !== null) return new SignInServerRefusal(wrongServer, username);
  const admission: AdmissionReason | null = admissionReasonOf({ reason_code: outcome.reasonCode });
  return admission !== null ? new AdmissionRefusal(admission, outcome.message, outcome.challenge) : new Error(outcome.message);
}
