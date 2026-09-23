/**
 * The agent's answer to one Connect, by request id.
 *
 * Registered BEFORE the Connect is sent, so an answer cannot arrive unheard.
 * Three answers settle it; anything else on the socket is someone else's.
 *
 * Lifted out of `useLoginHandler`, where it was inline, because the settings
 * page needs the same question answered: "is this the account's password?" --
 * the agent checks it against the live session and answers SessionAlreadyActive
 * or ConnectFailure.
 */
import { isResponseType, type InternalServiceResponse } from 'citadel-workspace-client-ts';
import { eventEmitter } from '@/lib/event-emitter';

export type ConnectOutcome =
  | { kind: 'connected'; cid: bigint }
  | { kind: 'already-active'; cid: bigint; username: string; message: string }
  | { kind: 'failed'; cid: bigint; message: string };

export function awaitConnectOutcome(requestId: string, timeoutMs: number): Promise<ConnectOutcome> {
  return new Promise<ConnectOutcome>((resolve, reject) => {
    const settle = (outcome: ConnectOutcome): void => {
      clearTimeout(timeout);
      eventEmitter.off('websocket-message', handler);
      resolve(outcome);
    };
    const handler = (message: InternalServiceResponse): void => {
      const response: InternalServiceResponse = (message as Record<string, unknown>).Response
        ? ((message as Record<string, unknown>).Response as InternalServiceResponse) : message;
      if (isResponseType(response, 'ConnectSuccess') && response.ConnectSuccess.request_id === requestId) {
        settle({ kind: 'connected', cid: response.ConnectSuccess.cid });
      } else if (isResponseType(response, 'SessionAlreadyActive') && response.SessionAlreadyActive.request_id === requestId) {
        const { cid, username, message: msg } = response.SessionAlreadyActive;
        settle({ kind: 'already-active', cid: cid as bigint, username: username ?? '', message: msg ?? '' });
      } else if (isResponseType(response, 'ConnectFailure') && response.ConnectFailure.request_id === requestId) {
        settle({ kind: 'failed', cid: response.ConnectFailure.cid, message: response.ConnectFailure.message || 'Connection failed' });
      }
    };
    const timeout: ReturnType<typeof setTimeout> = setTimeout((): void => {
      eventEmitter.off('websocket-message', handler);
      reject(new Error('Connection timeout'));
    }, timeoutMs);
    eventEmitter.on('websocket-message', handler);
  });
}
