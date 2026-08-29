/**
 * Proxy one request through the leader tab and wait for its ack.
 *
 * Extracted from InstanceChannel to keep that class under the file cap; the
 * behaviour is unchanged, including the ack listener's cleanup and the outer
 * timeout that resolves rather than rejects.
 */
import { eventEmitter } from '../event-emitter';
import { outboundQueue, type AckResult, type ProxyResponseData } from './outbound-queue';
import { TIMEOUT } from '@/lib/timeout-constants';

type OutboundMessage = Parameters<typeof import('./instance-channel').instanceChannel.send>[0];

export function sendToLeader(
  channel: { send: (m: OutboundMessage) => void },
  payload: unknown,
  requestId?: string,
): Promise<AckResult> {
  const id: string = requestId || crypto.randomUUID();

  return new Promise((resolve) => {
    outboundQueue.enqueue(payload, id);

    const ackHandler = (event: { requestId: string; status: 'processed' | 'error'; error?: string; data?: ProxyResponseData }): void => {
      if (event.requestId === id) {
        clearTimeout(timeout);
        eventEmitter.off('outbound-ack', ackHandler);
        resolve({ status: event.status, error: event.error, data: event.data });
      }
    };

    eventEmitter.on('outbound-ack', ackHandler);

    const timeout: NodeJS.Timeout = setTimeout((): void => {
      eventEmitter.off('outbound-ack', ackHandler);
      // Drop it from the queue. The ack path calls acknowledge(); this one did
      // not, so a timed-out request stayed in the map forever — and
      // `onLeaderChange` replays every queued entry. The caller had ALREADY
      // been told the request failed and had surfaced that to the user, and
      // then the identical payload was silently re-sent to the next leader,
      // and again at every leader change after that. A Connect, a workspace
      // mutation or a P2P message could be executed minutes later, repeatedly,
      // with nothing in the UI to say so.
      outboundQueue.acknowledge(id, {
        status: 'error',
        error: 'Timeout waiting for ACK from leader',
      });
      resolve({ status: 'error', error: 'Timeout waiting for ACK from leader' });
    }, TIMEOUT.OUTBOUND_ACK_MS);

    channel.send({ type: 'outbound-request', targetInstanceId: 'leader', requestId: id, payload });
  });
}
