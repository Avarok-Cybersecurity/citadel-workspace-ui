/**
 * Remove a member from a peer group, and take them off the kicker's roster.
 *
 * The SDK tells the removed member (`Disconnected`) and every REMAINING member
 * except the kicker (`MemberStateChanged::LeftGroup`). The kicker gets only
 * `GroupKickSuccess`, which names no member. Nothing acted on it, so the owner's
 * member table and the group's info panel kept "Members (2)" and the removed
 * person until a reload.
 *
 * The request id is the one thing that ties the answer to the member, so it is
 * minted here and the wait is armed BEFORE the request goes out.
 */
import { eventEmitter } from '@/lib/event-emitter';
import { sendGroupKick } from './group-requests';

/** Long enough for a relay round trip on a retransmitting link; short enough to fail. */
const KICK_TIMEOUT_MS: number = 30_000;

function awaitKickAnswer(requestId: string, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let done: boolean = false;
    const finish = (fn: () => void): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      eventEmitter.off('group:kick-succeeded', onSuccess);
      eventEmitter.off('group:failed', onFailed);
      fn();
    };
    const onSuccess = (payload: { requestId: string }): void => {
      if (payload.requestId === requestId) finish(resolve);
    };
    // The failure itself is toasted by group-failure-toasts; this only stops waiting.
    const onFailed = (payload: { requestId?: string; message: string }): void => {
      if (payload.requestId === requestId) finish(() => reject(new Error(payload.message || 'The server refused to remove that member.')));
    };
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      finish(() => reject(new Error('The server did not confirm the removal in time.')));
    }, timeoutMs);
    eventEmitter.on('group:kick-succeeded', onSuccess);
    eventEmitter.on('group:failed', onFailed);
  });
}

export async function kickGroupMember(groupId: string, memberCid: bigint): Promise<void> {
  const requestId: string = crypto.randomUUID();
  const answered: Promise<void> = awaitKickAnswer(requestId, KICK_TIMEOUT_MS);
  try {
    await sendGroupKick(groupId, memberCid, requestId);
  } catch (error) {
    answered.catch((): void => undefined);
    throw error;
  }
  await answered;
  // The same event a remaining member's LeftGroup produces, so one handler edits the roster.
  eventEmitter.emit('group:member-left', { groupId, memberCid });
}
