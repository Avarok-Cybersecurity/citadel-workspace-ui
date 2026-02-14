/**
 * Channel Leader Election
 *
 * Leader election protocol: heartbeats, timeout detection, sticky leadership.
 * Extracted from InstanceChannel for file size management.
 */

import { eventEmitter } from '../event-emitter';
import { instanceManager } from './instance-manager';
import { debugLog } from '@/lib/debug-config';
import { INTERVAL } from '../timeout-constants';
import type { ChannelMessage } from './channel-types';

const HEARTBEAT_INTERVAL_MS = INTERVAL.HEARTBEAT_MS;
const LEADER_TIMEOUT_MS = INTERVAL.LEADER_TIMEOUT_MS;

export interface LeaderElectionState {
  lastLeaderHeartbeat: number;
  leaderCheckInterval: ReturnType<typeof setInterval> | null;
  heartbeatInterval: ReturnType<typeof setInterval> | null;
  initTime: number;
  send: (message: Omit<ChannelMessage, 'senderInstanceId' | 'timestamp'> & { senderInstanceId?: string; timestamp?: number }) => void;
}

export function handleLeaderElection(state: LeaderElectionState, message: ChannelMessage): void {
  const payload = message.payload as Record<string, unknown> | undefined;
  if (payload?.isLeader) {
    const theirId = BigInt((payload.instanceIdBigInt as string) || '0');
    const myId = instanceManager.instanceIdAsBigInt;

    // STICKY LEADERSHIP RULE 1: If we're already the leader, stay leader
    if (instanceManager.isLeader) {
      debugLog('InstanceChannel', `[InstanceChannel] Rejecting leader claim from ${message.senderInstanceId} - we are the established leader (sticky)`);
      sendHeartbeat(state);
      return;
    }

    // STICKY LEADERSHIP RULE 2: If there's already an established leader, ignore new claims
    const currentLeaderId = instanceManager.leaderId;
    if (currentLeaderId && currentLeaderId !== message.senderInstanceId) {
      const timeSinceHeartbeat = Date.now() - state.lastLeaderHeartbeat;
      if (timeSinceHeartbeat < LEADER_TIMEOUT_MS) {
        debugLog('InstanceChannel', `[InstanceChannel] Ignoring leader claim from ${message.senderInstanceId} - already following ${currentLeaderId}`);
        return;
      }
    }

    // No established leader (or current leader timed out) - accept this claim
    instanceManager.setLeader(false, message.senderInstanceId);
    state.lastLeaderHeartbeat = Date.now();

    eventEmitter.emit('instance:leader-changed', { isLeader: false, leaderId: message.senderInstanceId });
    eventEmitter.emit('leader-changed', { isLeader: false, leaderId: message.senderInstanceId });

    debugLog('InstanceChannel', `[InstanceChannel] Accepted leader ${message.senderInstanceId} (ID: ${theirId}, myId: ${myId})`);
  }
}

export function handleLeaderHeartbeat(state: LeaderElectionState, message: ChannelMessage): void {
  state.lastLeaderHeartbeat = Date.now();
  debugLog('InstanceChannel', `Heartbeat received from ${message.senderInstanceId}, current leaderId=${instanceManager.leaderId}`);

  if (instanceManager.leaderId !== message.senderInstanceId) {
    debugLog('InstanceChannel', `Acknowledging leader from heartbeat: ${message.senderInstanceId} (was: ${instanceManager.leaderId})`);
    instanceManager.setLeader(false, message.senderInstanceId);

    eventEmitter.emit('instance:leader-changed', { isLeader: false, leaderId: message.senderInstanceId });
    eventEmitter.emit('leader-changed', { isLeader: false, leaderId: message.senderInstanceId });
  }
}

export function startLeaderElection(state: LeaderElectionState): void {
  const INITIAL_WAIT_MS = HEARTBEAT_INTERVAL_MS + 500;

  state.leaderCheckInterval = setInterval(() => {
    const now = Date.now();
    const timeSinceInit = now - state.initTime;

    if (instanceManager.isLeader) {
      sendHeartbeat(state);
    } else if (timeSinceInit > INITIAL_WAIT_MS) {
      if (state.lastLeaderHeartbeat === 0) {
        debugLog('InstanceChannel', '[InstanceChannel] No heartbeat ever received, attempting to become leader');
        tryBecomeLeader(state);
      } else if (now - state.lastLeaderHeartbeat > LEADER_TIMEOUT_MS) {
        debugLog('InstanceChannel', '[InstanceChannel] Leader timeout, attempting to become leader');
        tryBecomeLeader(state);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  setTimeout(() => {
    if (!instanceManager.leaderId && state.lastLeaderHeartbeat === 0) {
      debugLog('InstanceChannel', '[InstanceChannel] No leader detected after initial wait, attempting to become leader');
      tryBecomeLeader(state);
    }
  }, INITIAL_WAIT_MS);
}

export function tryBecomeLeader(state: LeaderElectionState): void {
  const myId = instanceManager.instanceIdAsBigInt;

  if (instanceManager.isLeader) {
    debugLog('InstanceChannel', '[InstanceChannel] Already leader, staying leader');
    sendHeartbeat(state);
    return;
  }

  if (state.lastLeaderHeartbeat > 0) {
    const timeSinceHeartbeat = Date.now() - state.lastLeaderHeartbeat;
    if (timeSinceHeartbeat < LEADER_TIMEOUT_MS) {
      debugLog('InstanceChannel', `[InstanceChannel] Recent heartbeat ${timeSinceHeartbeat}ms ago, not challenging (timeout: ${LEADER_TIMEOUT_MS}ms)`);
      return;
    }
    debugLog('InstanceChannel', `[InstanceChannel] Leader timed out (${timeSinceHeartbeat}ms > ${LEADER_TIMEOUT_MS}ms), claiming leadership`);
  } else {
    debugLog('InstanceChannel', '[InstanceChannel] No heartbeat ever received, claiming leadership');
  }

  instanceManager.setLeader(true, instanceManager.instanceId);
  state.lastLeaderHeartbeat = Date.now();

  state.send({
    type: 'leader-election',
    targetInstanceId: '*',
    senderInstanceId: instanceManager.instanceId,
    timestamp: Date.now(),
    payload: { isLeader: true, instanceIdBigInt: myId.toString() },
  });

  eventEmitter.emit('instance:leader-changed', { isLeader: true, leaderId: instanceManager.instanceId });
  eventEmitter.emit('leader-changed', { isLeader: true, leaderId: instanceManager.instanceId });

  debugLog('InstanceChannel', `[InstanceChannel] Became leader (ID: ${myId})`);
  sendHeartbeat(state);
}

export function sendHeartbeat(state: LeaderElectionState): void {
  state.send({
    type: 'leader-heartbeat',
    targetInstanceId: '*',
    senderInstanceId: instanceManager.instanceId,
    timestamp: Date.now(),
  });
}
