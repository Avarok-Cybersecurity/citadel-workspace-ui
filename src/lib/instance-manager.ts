/**
 * Instance Manager
 *
 * Tracks this instance's identity and state in the multi-instance architecture.
 * Each browser tab/window is an "instance" identified by a unique instanceId.
 * Each instance can own at most one session (CID) at a time.
 *
 * Key concepts:
 * - instanceId: Unique identifier for this tab (persisted in sessionStorage)
 * - cid: The session this instance "owns" (set after login/claim)
 * - isLeader: Whether this instance manages the WebSocket
 * - leaderId: The instanceId of the current leader
 */

import { eventEmitter } from './event-emitter';

const INSTANCE_ID_KEY = 'citadel-instance-id';

export interface InstanceState {
  instanceId: string;
  cid: string | null;
  isLeader: boolean;
  leaderId: string | null;
}

export interface InstanceInfo {
  instanceId: string;
  cid: string | null;
}

class InstanceManager {
  private static instance: InstanceManager;

  private _instanceId: string;
  private _cid: string | null = null;
  private _isLeader: boolean = false;
  private _leaderId: string | null = null;

  // Map of instanceId → CID for all known instances
  private knownInstances: Map<string, string | null> = new Map();

  private constructor() {
    this._instanceId = this.getOrCreateInstanceId();
    this.knownInstances.set(this._instanceId, null);
    this.setupEventListeners();

    console.log(`[InstanceManager] Initialized with instanceId: ${this._instanceId}`);
  }

  public static getInstance(): InstanceManager {
    if (!InstanceManager.instance) {
      InstanceManager.instance = new InstanceManager();
    }
    return InstanceManager.instance;
  }

  /**
   * Get or create a unique instance ID for this tab
   * Persisted in sessionStorage so it survives page reloads but not new tabs
   */
  private getOrCreateInstanceId(): string {
    let instanceId = sessionStorage.getItem(INSTANCE_ID_KEY);

    if (!instanceId) {
      instanceId = `inst-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem(INSTANCE_ID_KEY, instanceId);
    }

    return instanceId;
  }

  private setupEventListeners(): void {
    // Listen for leader changes (from instance-channel or existing broadcast service)
    eventEmitter.on('instance:leader-changed', (data: { isLeader: boolean; leaderId: string }) => {
      this._isLeader = data.isLeader;
      this._leaderId = data.leaderId;

      console.log(`[InstanceManager] Leader changed - isLeader: ${this._isLeader}, leaderId: ${this._leaderId}`);

      // Emit our own event for components that care about our leader status
      eventEmitter.emit('instance:state-changed', this.getState());
    });

    // Listen for instance registry updates
    eventEmitter.on('instance:registry-update', (data: { instanceId: string; cid: string | null }) => {
      this.knownInstances.set(data.instanceId, data.cid);
      console.log(`[InstanceManager] Registry updated: ${data.instanceId} → ${data.cid}`);
    });

    // Listen for instance disconnection
    eventEmitter.on('instance:disconnected', (data: { instanceId: string }) => {
      this.knownInstances.delete(data.instanceId);
      console.log(`[InstanceManager] Instance disconnected: ${data.instanceId}`);
    });
  }

  // ============ Getters ============

  get instanceId(): string {
    return this._instanceId;
  }

  get cid(): string | null {
    return this._cid;
  }

  get isLeader(): boolean {
    return this._isLeader;
  }

  get leaderId(): string | null {
    return this._leaderId;
  }

  /**
   * Get the current state as a snapshot
   */
  getState(): InstanceState {
    return {
      instanceId: this._instanceId,
      cid: this._cid,
      isLeader: this._isLeader,
      leaderId: this._leaderId,
    };
  }

  // ============ Setters ============

  /**
   * Set the CID this instance owns
   * Called after successful login or session claim
   */
  setCid(cid: string | null): void {
    const previousCid = this._cid;
    this._cid = cid;
    this.knownInstances.set(this._instanceId, cid);

    console.log(`[InstanceManager] CID changed: ${previousCid} → ${cid}`);

    // Emit state change
    eventEmitter.emit('instance:state-changed', this.getState());

    // Broadcast to other instances
    eventEmitter.emit('instance:cid-changed', {
      instanceId: this._instanceId,
      cid: cid,
    });
  }

  /**
   * Update leader status
   * Called by leader election logic
   */
  setLeader(isLeader: boolean, leaderId: string): void {
    this._isLeader = isLeader;
    this._leaderId = leaderId;

    eventEmitter.emit('instance:state-changed', this.getState());
  }

  // ============ Instance Registry ============

  /**
   * Register another instance's CID mapping
   */
  registerInstance(instanceId: string, cid: string | null): void {
    this.knownInstances.set(instanceId, cid);
    console.log(`[InstanceManager] Registered instance: ${instanceId} → ${cid}`);
  }

  /**
   * Unregister an instance (e.g., when tab closes)
   */
  unregisterInstance(instanceId: string): void {
    this.knownInstances.delete(instanceId);
    console.log(`[InstanceManager] Unregistered instance: ${instanceId}`);
  }

  /**
   * Find which instance owns a specific CID
   */
  findInstanceByCid(cid: string): string | null {
    for (const [instanceId, instanceCid] of this.knownInstances) {
      if (instanceCid === cid) {
        return instanceId;
      }
    }
    return null;
  }

  /**
   * Get all known instances
   */
  getAllInstances(): InstanceInfo[] {
    return Array.from(this.knownInstances.entries()).map(([instanceId, cid]) => ({
      instanceId,
      cid,
    }));
  }

  /**
   * Check if this instance owns a specific CID
   */
  ownsCid(cid: string): boolean {
    return this._cid === cid;
  }

  /**
   * Check if a message is relevant for this instance
   * Used for filtering incoming messages
   */
  isMessageRelevant(targetInstanceId: string): boolean {
    return targetInstanceId === '*' || targetInstanceId === this._instanceId;
  }

  // ============ Lifecycle ============

  /**
   * Clean up when instance is being destroyed (e.g., tab closing)
   */
  destroy(): void {
    // Notify other instances we're going away
    eventEmitter.emit('instance:disconnected', {
      instanceId: this._instanceId,
    });

    console.log(`[InstanceManager] Destroyed instance: ${this._instanceId}`);
  }
}

// Export singleton instance
export const instanceManager = InstanceManager.getInstance();

// Also export class for testing
export { InstanceManager };
