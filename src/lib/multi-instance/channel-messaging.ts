/**
 * Channel Messaging
 *
 * Message handlers for non-election messages: outbound requests, ACKs,
 * inbound forwards, instance announce/goodbye, session release, CID update.
 */

import { eventEmitter } from '../event-emitter';
import { instanceManager } from './instance-manager';
import { outboundQueue } from './outbound-queue';
import { debugLog } from '@/lib/debug-config';
import type { ChannelMessage } from './channel-types';
import type { LeaderElectionState } from './channel-leader-election';
import { sendHeartbeat } from './channel-leader-election';

// ── Outbound Request (Follower -> Leader) ─────────────────────────────────

export function handleOutboundRequest(message: ChannelMessage): void {
  if (!instanceManager.isLeader) {
    debugLog('InstanceChannel', 'Received outbound-request but not leader, ignoring');
    return;
  }

  debugLog('InstanceChannel', `Leader received outbound-request from ${message.senderInstanceId}, requestId=${message.requestId}`);

  eventEmitter.emit('channel:outbound-request', {
    requestId: message.requestId,
    senderInstanceId: message.senderInstanceId,
    payload: message.payload,
  });
}

// ── Outbound ACK (Leader -> Follower) ─────────────────────────────────────

export function handleOutboundAck(message: ChannelMessage): void {
  if (message.requestId) {
    const result = {
      status: message.status || 'error',
      error: message.error,
      data: message.data,
    } as const;

    outboundQueue.acknowledge(message.requestId, result);

    eventEmitter.emit('outbound-ack', {
      requestId: message.requestId,
      status: result.status,
      error: result.error,
      data: result.data,
    });
  }
}

// ── Inbound Forward (Leader -> Follower) ──────────────────────────────────

export function handleInboundForward(message: ChannelMessage): void {
  eventEmitter.emit('channel:inbound-message', {
    payload: message.payload,
    senderInstanceId: message.senderInstanceId,
    requestId: message.requestId,
  });
}

/**
 * A forwarded message reached an attached handler in the target tab.
 *
 * Deliberately NOT routed through `outboundQueue.acknowledge`: that queue's
 * retry semantics are follower-to-leader, and its unknown-id path would log
 * noise for every inbound ack.
 */
export function handleInboundAck(message: ChannelMessage): void {
  if (!message.requestId) return;
  eventEmitter.emit('channel:inbound-ack', {
    requestId: message.requestId,
    senderInstanceId: message.senderInstanceId,
  });
}

// ── Instance Announce ─────────────────────────────────────────────────────

export function handleInstanceAnnounce(state: LeaderElectionState, message: ChannelMessage): void {
  const announcePayload = message.payload as Record<string, unknown> | undefined;
  const cid = (announcePayload?.cid as bigint | null) || null;
  debugLog('InstanceChannel', `handleInstanceAnnounce: from=${message.senderInstanceId}, cid=${cid?.toString()}`);

  instanceManager.registerInstance(message.senderInstanceId, cid);

  if (instanceManager.isLeader) {
    debugLog('InstanceChannel', `[InstanceChannel] New instance announced, sending immediate heartbeat`);
    sendHeartbeat(state);
  }
}

// ── Instance Goodbye ──────────────────────────────────────────────────────

export function handleInstanceGoodbye(state: LeaderElectionState, message: ChannelMessage): void {
  instanceManager.unregisterInstance(message.senderInstanceId);

  if (instanceManager.leaderId === message.senderInstanceId) {
    debugLog('InstanceChannel', '[InstanceChannel] Leader is leaving, clearing leader state');
    instanceManager.setLeader(false, '');
    state.lastLeaderHeartbeat = 0;

    setTimeout(() => {
      // Lazy import to avoid circular dependency
      void import('./channel-leader-election').then(({ tryBecomeLeader }) => {
        tryBecomeLeader(state);
      });
    }, 100);
  }
}

// ── Session Release ───────────────────────────────────────────────────────

export function handleSessionRelease(message: ChannelMessage): void {
  if (!instanceManager.isLeader) {
    debugLog('InstanceChannel', 'Received session-release but not leader');
    return;
  }

  const releasePayload = message.payload as Record<string, unknown> | undefined;
  const releaseCid = releasePayload?.cid;
  if (!releaseCid) {
    debugLog('InstanceChannel', 'Received session-release without CID');
    return;
  }

  debugLog('InstanceChannel', `[InstanceChannel] Leader handling session release for CID ${releaseCid}`);
  eventEmitter.emit('session:release-request', { cid: releaseCid });
}

// ── CID Update ────────────────────────────────────────────────────────────

export function handleCidUpdate(message: ChannelMessage): void {
  const cidPayload = message.payload as Record<string, unknown> | undefined;
  const cidValue = cidPayload?.cid;
  const cidBigInt = cidValue ? BigInt(cidValue as string) : null;

  instanceManager.registerInstance(message.senderInstanceId, cidBigInt);

  debugLog('InstanceChannel',
    `[InstanceChannel] CID update from ${message.senderInstanceId}: ${cidBigInt?.toString() || 'null'}`
  );
}
