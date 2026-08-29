/**
 * Tab-close lifecycle policy for the instance channel.
 *
 * Owns the decision made in beforeunload: if this is the LAST tab holding a
 * CID, the session must be released (directly when leader, via the leader
 * otherwise) before the goodbye goes out. Split from instance-channel.ts so
 * the channel stays transport wiring and this policy is legible on its own.
 */

import { eventEmitter } from '../event-emitter';
import { instanceManager } from './instance-manager';
import { debugLog } from '@/lib/debug-config';
import type { ChannelMessage } from './channel-types';
import type { InstanceInfo } from '@/lib/multi-instance/instance-manager-types';

interface UnloadChannel {
  send(message: Omit<ChannelMessage, 'senderInstanceId' | 'timestamp'>): void;
  announceGoodbye(): void;
}

export function setupBeforeUnloadHandler(channel: UnloadChannel): void {
  window.addEventListener('beforeunload', () => {
    const myCid: bigint | null = instanceManager.cid;

    if (myCid) {
      const otherInstancesWithSameCid: InstanceInfo[] = instanceManager.getAllInstances()
        .filter(i => i.instanceId !== instanceManager.instanceId && i.cid === myCid);

      if (otherInstancesWithSameCid.length === 0) {
        debugLog('InstanceChannel', `[InstanceChannel] Last tab with CID ${myCid} closing, releasing session`);
        if (instanceManager.isLeader) {
          eventEmitter.emit('session:release-request', { cid: myCid });
        } else {
          channel.send({ type: 'session-release', targetInstanceId: 'leader', payload: { cid: myCid } });
        }
      }
    }

    channel.announceGoodbye();
  });
}
