// Instance Channel (Singleton): coordinates leader election + message handling.
import { eventEmitter } from '../event-emitter';
import { instanceManager } from './instance-manager';
import { outboundQueue, type AckResult, type ProxyResponseData } from './outbound-queue';
import { debugLog } from '@/lib/debug-config';
import { TIMEOUT } from '../timeout-constants';
import { CHANNEL_NAME, type ChannelMessage } from './channel-types';
import type { LeaderElectionState } from './channel-leader-election';
import {
  startLeaderElection,
  tryBecomeLeader,
  handleLeaderElection,
  handleLeaderHeartbeat,
  sendHeartbeat,
} from './channel-leader-election';
import {
  handleOutboundRequest,
  handleOutboundAck,
  handleInboundForward,
  handleInstanceAnnounce,
  handleInstanceGoodbye,
  handleSessionRelease,
  handleCidUpdate,
} from './channel-messaging';

// Re-export types for consumers
export type { ChannelMessage, ChannelMessageType } from './channel-types';

class InstanceChannel {
  private static instance: InstanceChannel;

  private channel: BroadcastChannel | null = null;
  private electionState: LeaderElectionState;

  private constructor() {
    this.electionState = {
      lastLeaderHeartbeat: 0,
      leaderCheckInterval: null,
      heartbeatInterval: null,
      initTime: Date.now(),
      send: (msg) => this.send(msg),
    };
    this.initialize();
  }

  public static getInstance(): InstanceChannel {
    if (!InstanceChannel.instance) {
      InstanceChannel.instance = new InstanceChannel();
    }
    return InstanceChannel.instance;
  }

  private initialize(): void {
    if (typeof BroadcastChannel === 'undefined') {
      debugLog('InstanceChannel', 'BroadcastChannel API not supported');
      return;
    }

    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.setupMessageHandler();
      this.setupEventListeners();
      startLeaderElection(this.electionState);
      this.announcePresence();
      this.setupBeforeUnloadHandler();
      debugLog('InstanceChannel', '[InstanceChannel] Initialized');
    } catch (error) {
      debugLog('InstanceChannel', 'Failed to initialize:', error);
    }
  }

  private setupEventListeners(): void {
    eventEmitter.on('instance:cid-changed', (data: { instanceId: string; cid: bigint | null }) => {
      this.send({
        type: 'cid-update', targetInstanceId: '*',
        payload: { cid: data.cid ? data.cid.toString() : null },
      });
    });

    // Re-broadcast on leader change so a new leader inherits every
    // follower's CID. Without it, CID-routed notifications drop with
    // `No instance owns CID …` after a handover.
    eventEmitter.on('instance:leader-changed', () => { this.broadcastCid(); this.announcePresence(); });
  }

  private setupMessageHandler(): void {
    if (!this.channel) return;

    this.channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const message = event.data;
      if (message.senderInstanceId === instanceManager.instanceId) return;
      if (!this.isMessageForUs(message)) return;
      this.handleMessage(message);
    };

    this.channel.addEventListener('messageerror', (event: MessageEvent) => {
      debugLog('InstanceChannel', 'Channel error:', event);
    });
  }

  private setupBeforeUnloadHandler(): void {
    window.addEventListener('beforeunload', () => {
      const myCid = instanceManager.cid;

      if (myCid) {
        const otherInstancesWithSameCid = instanceManager.getAllInstances()
          .filter(i => i.instanceId !== instanceManager.instanceId && i.cid === myCid);

        if (otherInstancesWithSameCid.length === 0) {
          debugLog('InstanceChannel', `[InstanceChannel] Last tab with CID ${myCid} closing, releasing session`);
          if (instanceManager.isLeader) {
            eventEmitter.emit('session:release-request', { cid: myCid });
          } else {
            this.send({ type: 'session-release', targetInstanceId: 'leader', payload: { cid: myCid } });
          }
        }
      }

      this.announceGoodbye();
    });
  }

  private isMessageForUs(message: ChannelMessage): boolean {
    const target = message.targetInstanceId;
    if (target === '*' || target === 'broadcast') return true;
    if (target === 'leader') return instanceManager.isLeader;
    return target === instanceManager.instanceId;
  }

  private handleMessage(message: ChannelMessage): void {
    if (message.type !== 'leader-heartbeat') {
      debugLog('InstanceChannel', `[InstanceChannel] Received ${message.type} from ${message.senderInstanceId}`);
    }

    switch (message.type) {
      case 'outbound-request': handleOutboundRequest(message); break;
      case 'outbound-ack': handleOutboundAck(message); break;
      case 'inbound-forward': handleInboundForward(message); break;
      case 'leader-election': handleLeaderElection(this.electionState, message); break;
      case 'leader-heartbeat': handleLeaderHeartbeat(this.electionState, message); break;
      case 'instance-announce': handleInstanceAnnounce(this.electionState, message); break;
      case 'instance-goodbye': handleInstanceGoodbye(this.electionState, message); break;
      case 'session-release': handleSessionRelease(message); break;
      case 'cid-update': handleCidUpdate(message); break;
      // Self-heal: leader missed our cid-update. Re-broadcast on demand.
      // No `if (instanceManager.cid)` guard — `broadcastCid()` self-guards AND
      // falls back to the tab-context `selectedCid`. A follower whose CID
      // currently lives only in tab-context (just after a ClaimSession or a
      // reload, before `setCid` ran) MUST still answer this report; the old
      // guard short-circuited that fallback, leaving the leader unable to learn
      // the owner so CID-routed notifications fell back to (and were dropped by)
      // the leader. Tabs that genuinely own nothing make `broadcastCid()` a
      // no-op, so dropping the guard is safe.
      case 'cid-report-request': this.broadcastCid(); break;
    }
  }

  // Some auth paths land the CID in tab-context before instanceManager;
  // the heal must look there too or route-miss recovery is a no-op.
  broadcastCid(): void {
    if (instanceManager.cid) { this.sendCidUpdate(instanceManager.cid); return; }
    void (async () => {
      const { getSelectedUser } = await import('../tab-context');
      const tab = await getSelectedUser();
      if (tab?.selectedCid) { instanceManager.setCid(tab.selectedCid); this.sendCidUpdate(tab.selectedCid); }
    })();
  }

  private sendCidUpdate(cid: bigint): void {
    this.send({ type: 'cid-update', targetInstanceId: '*', payload: { cid: cid.toString() } });
  }

  requestCidReport(): void { this.send({ type: 'cid-report-request', targetInstanceId: '*' }); }

  // ============ Public Methods ============

  send(message: Omit<ChannelMessage, 'senderInstanceId' | 'timestamp'> & { senderInstanceId?: string; timestamp?: number }): void {
    if (!this.channel) {
      debugLog('InstanceChannel', 'Channel not available');
      return;
    }

    const fullMessage: ChannelMessage = {
      ...message,
      senderInstanceId: message.senderInstanceId || instanceManager.instanceId,
      timestamp: message.timestamp || Date.now(),
    };

    try {
      this.channel.postMessage(fullMessage);
    } catch (error) {
      debugLog('InstanceChannel', 'Failed to send message:', error);
    }
  }

  sendToLeader(payload: unknown, requestId?: string): Promise<AckResult> {
    const id = requestId || crypto.randomUUID();

    return new Promise((resolve) => {
      outboundQueue.enqueue(payload, id);

      const ackHandler = (event: { requestId: string; status: 'processed' | 'error'; error?: string; data?: ProxyResponseData }) => {
        if (event.requestId === id) {
          clearTimeout(timeout);
          eventEmitter.off('outbound-ack', ackHandler);
          resolve({ status: event.status, error: event.error, data: event.data });
        }
      };

      eventEmitter.on('outbound-ack', ackHandler);

      const timeout = setTimeout(() => {
        eventEmitter.off('outbound-ack', ackHandler);
        resolve({ status: 'error', error: 'Timeout waiting for ACK from leader' });
      }, TIMEOUT.OUTBOUND_ACK_MS);

      this.send({ type: 'outbound-request', targetInstanceId: 'leader', requestId: id, payload });
    });
  }

  sendAck(targetInstanceId: string, requestId: string, result: AckResult): void {
    this.send({ type: 'outbound-ack', targetInstanceId, requestId, status: result.status, error: result.error, data: result.data });
  }

  forwardToInstance(targetInstanceId: string, payload: unknown): void {
    this.send({ type: 'inbound-forward', targetInstanceId, payload });
  }

  broadcast(payload: unknown): void {
    this.send({ type: 'inbound-forward', targetInstanceId: '*', payload });
  }

  announcePresence(): void {
    debugLog('InstanceChannel', `announcePresence: instanceId=${instanceManager.instanceId}, cid=${instanceManager.cid?.toString()}`);
    this.send({ type: 'instance-announce', targetInstanceId: '*', payload: { cid: instanceManager.cid } });
  }

  announceGoodbye(): void {
    this.send({ type: 'instance-goodbye', targetInstanceId: '*' });
  }

  destroy(): void {
    if (this.electionState.heartbeatInterval) clearInterval(this.electionState.heartbeatInterval);
    if (this.electionState.leaderCheckInterval) clearInterval(this.electionState.leaderCheckInterval);
    this.announceGoodbye();
    if (this.channel) { this.channel.close(); this.channel = null; }
    debugLog('InstanceChannel', '[InstanceChannel] Destroyed');
  }
}

// Export singleton instance
export const instanceChannel = InstanceChannel.getInstance();

// Also export class for testing
export { InstanceChannel };
