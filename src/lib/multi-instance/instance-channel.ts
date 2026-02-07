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

import { eventEmitter } from '../event-emitter';
import { instanceManager } from './instance-manager';
import { outboundQueue, type AckResult, type ProxyResponseData } from './outbound-queue';

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
  | 'session-release'
  | 'cid-update';

export interface ChannelMessage {
  type: ChannelMessageType;
  targetInstanceId: string; // '*' for broadcast, 'leader' for current leader, or specific instanceId
  senderInstanceId: string;
  timestamp: number;
  requestId?: string;
  payload?: any;
  status?: 'processed' | 'error';
  error?: string;
  data?: ProxyResponseData; // Typed data for acknowledgments
}

class InstanceChannel {
  private static instance: InstanceChannel;

  private channel: BroadcastChannel | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  // Initialize to 0 - no heartbeat received yet
  // The initial election wait period handles the first attempt
  private lastLeaderHeartbeat: number = 0;
  private leaderCheckInterval: ReturnType<typeof setInterval> | null = null;
  // Track when we started - used for initial wait period
  private readonly initTime: number = Date.now();

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
      this.setupEventListeners();
      this.startLeaderElection();
      this.announcePresence();
      this.setupBeforeUnloadHandler();

      console.log('[InstanceChannel] Initialized');
    } catch (error) {
      console.error('[InstanceChannel] Failed to initialize:', error);
    }
  }

  /**
   * Set up event listeners to broadcast local events to other instances
   */
  private setupEventListeners(): void {
    // When our CID changes (after authentication), broadcast to all instances
    // This allows the leader to know which CID we own for routing responses
    eventEmitter.on(
      'instance:cid-changed',
      (data: { instanceId: string; cid: bigint | null }) => {
        console.log(`[InstanceChannel] Broadcasting CID update: ${data.cid?.toString() || 'null'}`);

        this.send({
          type: 'cid-update',
          targetInstanceId: '*',
          payload: {
            // Convert BigInt to string for serialization
            cid: data.cid ? data.cid.toString() : null,
          },
        });
      }
    );
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

    this.channel.addEventListener('messageerror', (event: MessageEvent) => {
      console.error('[InstanceChannel] Channel error:', event);
    });
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

      case 'cid-update':
        this.handleCidUpdate(message);
        break;
    }
  }

  // ============ Message Handlers ============

  private handleOutboundRequest(message: ChannelMessage): void {
    // Only leader processes outbound requests
    if (!instanceManager.isLeader) {
      console.warn('[ILM-TRACE] Received outbound-request but not leader, ignoring');
      return;
    }

    console.log(`[ILM-TRACE] Leader received outbound-request from ${message.senderInstanceId}, requestId=${message.requestId}`);

    // Emit to leader-outbound-handler AND instance-inbound-router
    eventEmitter.emit('channel:outbound-request', {
      requestId: message.requestId,
      senderInstanceId: message.senderInstanceId,
      payload: message.payload,
    });
  }

  private handleOutboundAck(message: ChannelMessage): void {
    // Acknowledge in outbound queue
    if (message.requestId) {
      const result = {
        status: message.status || 'error',
        error: message.error,
        data: message.data, // Pass through data from leader
      } as const;

      outboundQueue.acknowledge(message.requestId, result);

      // Emit event for sendToLeader promise resolution
      eventEmitter.emit('outbound-ack', {
        requestId: message.requestId,
        status: result.status,
        error: result.error,
        data: result.data,
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
    if (message.payload?.isLeader) {
      const theirId = BigInt(message.payload.instanceIdBigInt || '0');
      const myId = instanceManager.instanceIdAsBigInt;

      // STICKY LEADERSHIP RULE 1: If we're already the leader, stay leader
      // Established leaders NEVER yield to newcomers, regardless of ID
      if (instanceManager.isLeader) {
        console.log(`[InstanceChannel] Rejecting leader claim from ${message.senderInstanceId} - we are the established leader (sticky)`);
        // Reassert our leadership via heartbeat (don't send leader-election to avoid ping-pong)
        this.sendHeartbeat();
        return;
      }

      // STICKY LEADERSHIP RULE 2: If there's already an established leader, ignore new claims
      // Only heartbeats from the established leader matter - not new election claims
      const currentLeaderId = instanceManager.leaderId;
      if (currentLeaderId && currentLeaderId !== message.senderInstanceId) {
        const timeSinceHeartbeat = Date.now() - this.lastLeaderHeartbeat;
        if (timeSinceHeartbeat < LEADER_TIMEOUT_MS) {
          console.log(`[InstanceChannel] Ignoring leader claim from ${message.senderInstanceId} - already following ${currentLeaderId}`);
          return;
        }
      }

      // No established leader (or current leader timed out) - accept this claim
      // First-come-first-serve: the first to claim wins, regardless of ID
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

      console.log(`[InstanceChannel] Accepted leader ${message.senderInstanceId} (ID: ${theirId}, myId: ${myId})`);
    }
  }

  private handleLeaderHeartbeat(message: ChannelMessage): void {
    this.lastLeaderHeartbeat = Date.now();
    console.log(`[ILM-TRACE] Heartbeat received from ${message.senderInstanceId}, current leaderId=${instanceManager.leaderId}`);

    // Acknowledge the leader if not already known
    // This is critical for new instances to know there's an existing leader
    if (instanceManager.leaderId !== message.senderInstanceId) {
      console.log(`[ILM-TRACE] Acknowledging leader from heartbeat: ${message.senderInstanceId} (was: ${instanceManager.leaderId})`);
      instanceManager.setLeader(false, message.senderInstanceId);

      // Emit events for compatibility
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

  private handleInstanceAnnounce(message: ChannelMessage): void {
    const cid = message.payload?.cid || null;
    console.log(`[ILM-TRACE] handleInstanceAnnounce: from=${message.senderInstanceId}, cid=${cid?.toString()}`);

    instanceManager.registerInstance(
      message.senderInstanceId,
      cid
    );

    // If we're the leader, send an immediate heartbeat to the new instance
    // This ensures they learn about us quickly and don't try to claim leadership
    if (instanceManager.isLeader) {
      console.log(`[InstanceChannel] New instance announced, sending immediate heartbeat`);
      this.sendHeartbeat();
    }
  }

  private handleInstanceGoodbye(message: ChannelMessage): void {
    instanceManager.unregisterInstance(message.senderInstanceId);

    // If the leader is leaving, allow new leader election
    if (instanceManager.leaderId === message.senderInstanceId) {
      console.log('[InstanceChannel] Leader is leaving, clearing leader state');
      instanceManager.setLeader(false, '');
      this.lastLeaderHeartbeat = 0;

      // Wait briefly then try to become leader
      setTimeout(() => {
        this.tryBecomeLeader();
      }, 100);
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

  /**
   * Handle CID update from another instance
   * This is received when an instance authenticates and gets its CID
   */
  private handleCidUpdate(message: ChannelMessage): void {
    const { cid } = message.payload || {};
    const cidBigInt = cid ? BigInt(cid) : null;

    // Update the instance registry
    instanceManager.registerInstance(message.senderInstanceId, cidBigInt);

    console.log(
      `[InstanceChannel] CID update from ${message.senderInstanceId}: ${cidBigInt?.toString() || 'null'}`
    );
  }

  // ============ Leader Election ============

  private startLeaderElection(): void {
    // Initial wait period: longer than heartbeat interval to ensure we'd receive a heartbeat if leader exists
    const INITIAL_WAIT_MS = HEARTBEAT_INTERVAL_MS + 500; // 2500ms

    // Start checking for leader liveness
    this.leaderCheckInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceInit = now - this.initTime;

      if (instanceManager.isLeader) {
        // We're the leader, send heartbeat
        this.sendHeartbeat();
      } else if (timeSinceInit > INITIAL_WAIT_MS) {
        // Only check for leader timeout after initial wait period
        // This prevents new instances from immediately trying to become leader
        if (this.lastLeaderHeartbeat === 0) {
          // Never received any heartbeat - no leader exists
          console.log('[InstanceChannel] No heartbeat ever received, attempting to become leader');
          this.tryBecomeLeader();
        } else if (now - this.lastLeaderHeartbeat > LEADER_TIMEOUT_MS) {
          // Had a leader but they timed out
          console.log('[InstanceChannel] Leader timeout, attempting to become leader');
          this.tryBecomeLeader();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Initial leader election after waiting for potential heartbeat from existing leader
    setTimeout(() => {
      if (!instanceManager.leaderId && this.lastLeaderHeartbeat === 0) {
        console.log('[InstanceChannel] No leader detected after initial wait, attempting to become leader');
        this.tryBecomeLeader();
      }
    }, INITIAL_WAIT_MS);
  }

  private tryBecomeLeader(): void {
    const myId = instanceManager.instanceIdAsBigInt;

    // STICKY LEADERSHIP: If we're already leader, stay leader
    if (instanceManager.isLeader) {
      console.log('[InstanceChannel] Already leader, staying leader');
      this.sendHeartbeat();
      return;
    }

    // STICKY LEADERSHIP: If we've received a heartbeat recently, don't challenge
    // This is strict: ANY recent heartbeat means we don't challenge
    if (this.lastLeaderHeartbeat > 0) {
      const timeSinceHeartbeat = Date.now() - this.lastLeaderHeartbeat;
      if (timeSinceHeartbeat < LEADER_TIMEOUT_MS) {
        console.log(`[InstanceChannel] Recent heartbeat ${timeSinceHeartbeat}ms ago, not challenging (timeout: ${LEADER_TIMEOUT_MS}ms)`);
        return;
      }
      console.log(`[InstanceChannel] Leader timed out (${timeSinceHeartbeat}ms > ${LEADER_TIMEOUT_MS}ms), claiming leadership`);
    } else {
      console.log('[InstanceChannel] No heartbeat ever received, claiming leadership');
    }

    // No leader or leader timed out - claim leadership
    instanceManager.setLeader(true, instanceManager.instanceId);
    this.lastLeaderHeartbeat = Date.now();

    // Announce leadership with our ID for comparison
    this.send({
      type: 'leader-election',
      targetInstanceId: '*',
      senderInstanceId: instanceManager.instanceId,
      timestamp: Date.now(),
      payload: {
        isLeader: true,
        instanceIdBigInt: myId.toString(), // String for serialization
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

    console.log(`[InstanceChannel] Became leader (ID: ${myId})`);

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
      const ackHandler = (event: { requestId: string; status: 'processed' | 'error'; error?: string; data?: any }) => {
        if (event.requestId === id) {
          clearTimeout(timeout);
          eventEmitter.off('outbound-ack', ackHandler);
          resolve({ status: event.status, error: event.error, data: event.data });
        }
      };

      // Register the ACK listener (critical: this was missing before!)
      eventEmitter.on('outbound-ack', ackHandler);

      // Set timeout - resolve with timeout error after 30 seconds
      // (workspace requests can take a while due to server processing)
      const timeout = setTimeout(() => {
        eventEmitter.off('outbound-ack', ackHandler);
        // Resolve with timeout error (don't hang forever)
        resolve({ status: 'error', error: 'Timeout waiting for ACK from leader' });
      }, 30000);

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
      data: result.data, // Pass through data (e.g., ensureMessengerOpen result)
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
    console.log(`[ILM-TRACE] announcePresence: instanceId=${instanceManager.instanceId}, cid=${instanceManager.cid?.toString()}`);
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
