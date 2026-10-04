/**
 * The Connect that connect_after_register could not make: on a workspace that
 * checks, the register token was spent on Register, so the agent's follow-up
 * Connect was refused with admission_required. This one carries a fresh
 * `sign-in` token, and answers a key challenge if the account asks for one.
 */
import * as wsModule from '@/lib/websocket-service';
import { awaitConnectOutcome, type ConnectOutcome } from '@/lib/connection/await-connect-outcome';
import { AdmissionRefusal } from '@/lib/admission/refusal';
import { passkeysAvailableHere } from '@/lib/passkey';
import { watchKeyChallenges } from '@/lib/sign-in/challenge-watch';
import type { SessionSecuritySettings } from '@/lib/security-utils';

const CONNECT_TIMEOUT_MS: 30000 = 30000;

/** Resolves with the session's CID; rejects with the server's reason (an AdmissionRefusal for the check). */
export async function connectAfterRegistration(
  username: string, password: string, admissionToken: string, settings: SessionSecuritySettings,
): Promise<bigint> {
  const requestId: string = crypto.randomUUID();
  const outcome: Promise<ConnectOutcome> = awaitConnectOutcome(requestId, CONNECT_TIMEOUT_MS);
  const unwatch: () => void = watchKeyChallenges(requestId);
  try {
    try {
      await wsModule.websocketService.connect(requestId, username,
        { password, securityKey: passkeysAvailableHere(), recoveryCode: null, admissionToken }, settings);
    } catch (error) {
      const _unanswered: Promise<unknown> = outcome.catch((): undefined => undefined);
      throw error;
    }
    const answer: ConnectOutcome = await outcome;
    if (answer.kind !== 'failed') return answer.cid;
    if (answer.reasonCode !== null) throw new AdmissionRefusal(answer.reasonCode, answer.message);
    throw new Error(answer.message);
  } finally {
    unwatch();
  }
}
