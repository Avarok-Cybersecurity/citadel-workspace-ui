/**
 * Whether this tab holds the WebSocket.
 *
 * One browser gets one WebSocket, owned by an elected leader tab; followers
 * finish initialisation with a null client on purpose. Calling is the one
 * feature that cannot be proxied cheaply to the leader the way chat is — media
 * frames leave 30-60 times a second per track, and cloning each through a
 * BroadcastChannel would buy multi-tab calling at the cost of the frame path
 * everyone else pays for. So calling is offered where it can actually work, and
 * says so where it cannot, instead of failing silently as it did before.
 */

import { useEffect, useState } from 'react';
import { instanceManager } from '@/lib/multi-instance';
import { eventEmitter } from '@/lib/event-emitter';

export function useIsLeaderTab(): boolean {
  const [isLeader, setIsLeader] = useState(() => instanceManager.isLeader);

  useEffect(() => {
    // Seeded again on mount: election can settle between the initial state and
    // the subscription below, and missing that leaves calling disabled in the
    // tab that owns the socket.
    setIsLeader(instanceManager.isLeader);
    const onChange = ({ isLeader: next }: { isLeader: boolean }) => setIsLeader(next);
    eventEmitter.on('instance:leader-changed', onChange);
    return () => eventEmitter.off('instance:leader-changed', onChange);
  }, []);

  return isLeader;
}
