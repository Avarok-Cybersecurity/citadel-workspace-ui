/**
 * "Is this the account's password?", answered by the agent, not by the page.
 *
 * Used before sealing a password under a new passkey from Settings, where the
 * password was not just typed into a successful sign-in. For a live session the
 * agent checks the password against the one that opened it and answers
 * SessionAlreadyActive (right) or ConnectFailure (wrong) without touching the
 * session; see citadel-internal-service connect.rs.
 */
import * as wsModule from '../websocket-service';
import { awaitConnectOutcome, type ConnectOutcome } from './await-connect-outcome';

const VERIFY_TIMEOUT_MS: 30000 = 30000;

export async function verifyAccountPassword(username: string, password: string): Promise<boolean> {
  const requestId: string = crypto.randomUUID();
  const outcomePromise: Promise<ConnectOutcome> = awaitConnectOutcome(requestId, VERIFY_TIMEOUT_MS);
  try {
    await wsModule.websocketService.connect(requestId, username, password, undefined);
  } catch (error) {
    const _unanswered: Promise<unknown> = outcomePromise.catch((): undefined => undefined);
    throw error;
  }
  const outcome: ConnectOutcome = await outcomePromise;
  return outcome.kind !== 'failed';
}
