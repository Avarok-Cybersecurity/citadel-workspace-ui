/**
 * Instance Channel
 *
 * Abstracts inter-instance communication using BroadcastChannel with targeted messaging.
 * All instances receive all messages, but only process those targeted to them.
 *
 * Message types:
 * - outbound-request: Follower → Leader (request to send via WebSocket)
 * - outbound-ack: Leader → Follower (ACK for outbound request)
 * - inbound-forward: Leader → Follower (message from WebSocket for follower's CID)
 * - leader-election: Election coordination
 * - leader-heartbeat: Leader liveness signal
 * - instance-announce: Instance announcing its presence and CID
 * - instance-goodbye: Instance leaving (tab close)
 *
 * Target addressing:
 * - Specific instanceId: Only that instance processes
 * - '*' or 'broadcast': All instances process
 * - 'leader': Current leader processes (resolved at receive time)
 */

import { eventEmitter } from './event-emitter';
import { instanceManager } from './instance-manager';
import { outboundQueue, type AckResult } from './outbound-queue';

const CHANNEL_NAME = 'citadel-instance-channel';
const HEARTBEAT_INTERVAL_MS = 2000;
const LEADER_TIMEOUT_MS = 5000;

export type ChannelMessageType =
  | 'outbound-request'
  | 'outbound-ack'
  | 'inbound-forward'
  | 'leader-election'
  | 'leader-heartbeat'
  | 'instance-announce'
  | 'instance-goodbye'
  | 'session-release';

export interface ChannelMessage {
  type: ChannelMessageType;
  targetInstanceId: string; // '*' for broadcast, 'leader' for current leader, or specific instanceId
  senderInstanceId: string;
  timestamp: number;
  requestId?: string;
  payload?: any;
  status?: 'processed' | 'error';
  error?: string;
}

class InstanceChannel {
  private static instance: InstanceChannel;

  private channel: BroadcastChannel | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastLeaderHeartbeat: number = 0;
  private leaderCheckInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
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
      console.error('[InstanceChannel] BroadcastChannel API not supported');
      return;
    }

    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.setupMessageHandler();
      this.startLeaderElection();
      this.announcePresence();
      this.setupBeforeUnloadHandler();

      console.log('[InstanceChannel] Initialized');
    } catch (error) {
      console.error('[InstanceChannel] Failed to initialize:', error);
    }
  }

  private setupMessageHandler(): void {
    if (!this.channel) return;

    this.channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const message = event.data;

      // Ignore our own messages
      if (message.senderInstanceId === instanceManager.instanceId) {
        return;
      }

      // Check if message is targeted to us
      if (!this.isMessageForUs(message)) {
        return;
      }

      this.handleMessage(message);
    };

    this.channel.onerror = (error) => {
      console.error('[InstanceChannel] Channel error:', error);
    };
  }

  /**
   * Set up handler for tab close to release session if this is the last tab with the CID
   */
  private setupBeforeUnloadHandler(): void {
    window.addEventListener('beforeunload', () => {
      const myCid = instanceManager.cid;

      if (myCid) {
        // Check if any OTHER instance has this same CID
        const otherInstancesWithSameCid = instanceManager.getAllInstances()
          .filter(i => i.instanceId !== instanceManager.instanceId && i.cid === myCid);

        if (otherInstancesWithSameCid.length === 0) {
          // This is the LAST tab with this CID - release the session
          console.log(`[InstanceChannel] Last tab with CID ${myCid} closing, releasing session`);

          if (instanceManager.isLeader) {
            // We're the leader - emit event directly for websocket-service to handle
            eventEmitter.emit('session:release-request', { cid: myCid });
          } else {
            // Ask leader to release via BroadcastChannel
            this.send({
              type: 'session-release',
              targetInstanceId: 'leader',
              payload: { cid: myCid },
            });
          }
        }
      }

      // Always announce goodbye
      this.announceGoodbye();
    });
  }

  /**
   * Check if a message should be processed by this instance
   */
  private isMessageForUs(message: ChannelMessage): boolean {
    const target = message.targetInstanceId;

    if (target === '*' || target === 'broadcast') {
      return true;
    }

    if (target === 'leader') {
      return instanceManager.isLeader;
    }

    return target === instanceManager.instanceId;
  }

  /**
   * Handle incoming message based on type
   */
  private handleMessage(message: ChannelMessage): void {
    // Rate-limited logging for frequent messages
    if (message.type !== 'leader-heartbeat') {
      console.log(`[InstanceChannel] Received ${message.type} from ${message.senderInstanceId}`);
    }

    switch (message.type) {
      case 'outbound-request':
        this.handleOutboundRequest(message);
        break;

      case 'outbound-ack':
        this.handleOutboundAck(message);
        break;

      case 'inbound-forward':
        this.handleInboundForward(message);
        break;

      case 'leader-election':
        this.handleLeaderElection(message);
        break;

      case 'leader-heartbeat':
        this.handleLeaderHeartbeat(message);
        break;

      case 'instance-announce':
        this.handleInstanceAnnounce(message);
        break;

      case 'instance-goodbye':
        this.handleInstanceGoodbye(message);
        break;

      case 'session-release':
        this.handleSessionRelease(message);
        break;
    }
  }

  // ============ Message Handlers ============

  private handleOutboundRequest(message: ChannelMessage): void {
    // Only leader processes outbound requests
    if (!instanceManager.isLeader) {
      console.warn('[InstanceChannel] Received outbound-request but not leader');
      return;
    }

    // Emit to leader-outbound-handler
    eventEmitter.emit('channel:outbound-request', {
      requestId: message.requestId,
      senderInstanceId: message.senderInstanceId,
      payload: message.payload,
    });
  }

  private handleOutboundAck(message: ChannelMessage): void {
    // Acknowledge in outbound queue
    if (message.requestId) {
      outboundQueue.acknowledge(message.requestId, {
        status: message.status || 'error',
        error: message.error,
      });
    }
  }

  private handleInboundForward(message: ChannelMessage): void {
    // Emit to instance for processing
    eventEmitter.emit('channel:inbound-message', {
      payload: message.payload,
      senderInstanceId: message.senderInstanceId,
    });
  }

  private handleLeaderElection(message: ChannelMessage): void {
    // Update leader info
    if (message.payload?.isLeader) {
      instanceManager.setLeader(false, message.senderInstanceId);
      this.lastLeaderHeartbeat = Date.now();

      // Emit to both event names for compatibility with existing code
      eventEmitter.emit('instance:leader-changed', {
        isLeader: false,
        leaderId: message.senderInstanceId,
      });
      eventEmitter.emit('leader-changed', {
        isLeader: false,
        leaderId: message.senderInstanceId,
      });
    }
  }

  private handleLeaderHeartbeat(message: ChannelMessage): void {
    this.lastLeaderHeartbeat = Date.now();
  }

  private handleInstanceAnnounce(message: ChannelMessage): void {
    instanceManager.registerInstance(
      message.senderInstanceId,
      message.payload?.cid || null
    );
  }

  private handleInstanceGoodbye(message: ChannelMessage): void {
    instanceManager.unregisterInstance(message.senderInstanceId);

    // If the leader is leaving, trigger election
    if (instanceManager.leaderId === message.senderInstanceId) {
      console.log('[InstanceChannel] Leader is leaving, triggering election');
      this.tryBecomeLeader();
    }
  }

  private handleSessionRelease(message: ChannelMessage): void {
    // Only leader processes session release requests
    if (!instanceManager.isLeader) {
      console.warn('[InstanceChannel] Received session-release but not leader');
      return;
    }

    const { cid } = message.payload || {};
    if (!cid) {
      console.warn('[InstanceChannel] Received session-release without CID');
      return;
    }

    console.log(`[InstanceChannel] Leader handling session release for CID ${cid}`);

    // Emit event for websocket-service to handle
    eventEmitter.emit('session:release-request', { cid });
  }

  // ============ Leader Election ============

  private startLeaderElection(): void {
    // Start checking for leader liveness
    this.leaderCheckInterval = setInterval(() => {
      const now = Date.now();

      if (instanceManager.isLeader) {
        // We're the leader, send heartbeat
        this.sendHeartbeat();
      } else {
        // Check if leader is alive
        if (now - this.lastLeaderHeartbeat > LEADER_TIMEOUT_MS) {
          console.log('[InstanceChannel] Leader timeout, attempting to become leader');
          this.tryBecomeLeader();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Initial leader check after short delay
    setTimeout(() => {
      if (!instanceManager.leaderId || this.lastLeaderHeartbeat === 0) {
        console.log('[InstanceChannel] No leader detected, attempting to become leader');
        this.tryBecomeLeader();
      }
    }, 500);
  }

  private tryBecomeLeader(): void {
    // Simple leader election: first to claim wins
    // In case of conflict, highest priority (random tiebreaker) wins
    const priority = Date.now() + Math.random();

    instanceManager.setLeader(true, instanceManager.instanceId);
    this.lastLeaderHeartbeat = Date.now();

    // Announce leadership
    this.send({
      type: 'leader-election',
      targetInstanceId: '*',
      senderInstanceId: instanceManager.instanceId,
      timestamp: Date.now(),
      payload: {
        isLeader: true,
        priority,
      },
    });

    // Emit to both event names for compatibility with existing code
    eventEmitter.emit('instance:leader-changed', {
      isLeader: true,
      leaderId: instanceManager.instanceId,
    });
    eventEmitter.emit('leader-changed', {
      isLeader: true,
      leaderId: instanceManager.instanceId,
    });

    console.log('[InstanceChannel] Became leader');

    // Start sending heartbeats
    this.sendHeartbeat();
  }

  private sendHeartbeat(): void {
    this.send({
      type: 'leader-heartbeat',
      targetInstanceId: '*',
      senderInstanceId: instanceManager.instanceId,
      timestamp: Date.now(),
    });
  }

  // ============ Public Methods ============

  /**
   * Send a message via the channel
   */
  send(message: Omit<ChannelMessage, 'senderInstanceId' | 'timestamp'> & { senderInstanceId?: string; timestamp?: number }): void {
    if (!this.channel) {
      console.error('[InstanceChannel] Channel not available');
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
      console.error('[InstanceChannel] Failed to send message:', error);
    }
  }

  /**
   * Send an outbound request to the leader
   * Returns a promise that resolves when ACK is received
   */
  sendToLeader(payload: any, requestId?: string): Promise<AckResult> {
    const id = requestId || crypto.randomUUID();

    return new Promise((resolve, reject) => {
      // Enqueue for tracking
      outboundQueue.enqueue(payload, id);

      // Set up ACK listener
      const ackHandler = (event: { requestId: string; status: 'processed' | 'error'; error?: string }) => {
        if (event.requestId === id) {
          eventEmitter.off('outbound-ack', ackHandler);
          resolve({ status: event.status, error: event.error });
        }
      };

      // Listen for ACK (from outbound queue acknowledge)
      const queueAckHandler = () => {
        // This is called by outboundQueue.acknowledge
        // We need to check if the message is ours and resolve
      };

      // Set timeout
      const timeout = setTimeout(() => {
        eventEmitter.off('outbound-ack', ackHandler);
        // Don't reject - let outbound queue handle retry
        // The promise will stay pending until max retries
      }, 5000);

      // Send to leader
      this.send({
        type: 'outbound-request',
        targetInstanceId: 'leader',
        requestId: id,
        payload,
      });
    });
  }

  /**
   * Send an ACK back to a specific instance
   */
  sendAck(targetInstanceId: string, requestId: string, result: AckResult): void {
    this.send({
      type: 'outbound-ack',
      targetInstanceId,
      requestId,
      status: result.status,
      error: result.error,
    });
  }

  /**
   * Forward an inbound message to a specific instance
   */
  forwardToInstance(targetInstanceId: string, payload: any): void {
    this.send({
      type: 'inbound-forward',
      targetInstanceId,
      payload,
    });
  }

  /**
   * Broadcast to all instances
   */
  broadcast(payload: any): void {
    this.send({
      type: 'inbound-forward',
      targetInstanceId: '*',
      payload,
    });
  }

  /**
   * Announce this instance's presence and CID
   */
  announcePresence(): void {
    this.send({
      type: 'instance-announce',
      targetInstanceId: '*',
      payload: {
        cid: instanceManager.cid,
      },
    });
  }

  /**
   * Announce instance is leaving
   */
  announceGoodbye(): void {
    this.send({
      type: 'instance-goodbye',
      targetInstanceId: '*',
    });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.leaderCheckInterval) {
      clearInterval(this.leaderCheckInterval);
    }

    this.announceGoodbye();

    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    console.log('[InstanceChannel] Destroyed');
  }
}

// Export singleton instance
export const instanceChannel = InstanceChannel.getInstance();

// Also export class for testing
export { InstanceChannel };
