/**
 * The map of which tab holds which session, and the four operations over it.
 *
 * Lifted out of `InstanceManager` because none of it touches instance state:
 * every function here is a pure operation on the registry map, which is what
 * made it the cohesive piece to separate when the manager outgrew the file
 * limit. The manager keeps ownership of the map and the singleton identity;
 * this module knows only how to read and write it.
 */
import { eventEmitter } from '@/lib/event-emitter';
import { debugLog } from '@/lib/debug-config';
import type { InstanceInfo } from './instance-manager-types';

/** Which tab is holding which session. Keyed by instance id. */
export type InstanceRegistry = Map<string, bigint | null>;

export function registerInstance(
  registry: InstanceRegistry,
  instanceId: string,
  cid: bigint | null,
): void {
  registry.set(instanceId, cid);
  debugLog('InstanceManager', `[InstanceManager] Registered instance: ${instanceId} -> ${cid?.toString()}`);
  // Emit so the inbound router can drain its CID-keyed orphan-message
  // buffer the moment a cid-report arrives — turns the self-heal flow
  // from "deliver locally, then route correctly next time" into
  // "buffer briefly, deliver to the right tab when the report lands".
  //
  // SUBSCRIBER CONTRACT: `cid` is `bigint | null`. Null fires on
  // the initial registry seed before the instance has a CID (e.g.
  // pre-ConnectSuccess). `unregisterInstance` does NOT emit
  // `instance:registered` — it only deletes from the map.
  // Subscribers MUST guard `if (cid === null) return;` — the orphan
  // buffer drain at `instance-inbound-router.ts` is the canonical
  // pattern.
  eventEmitter.emit('instance:registered', { instanceId, cid });
}

export function unregisterInstance(registry: InstanceRegistry, instanceId: string): void {
  registry.delete(instanceId);
  debugLog('InstanceManager', `[InstanceManager] Unregistered instance: ${instanceId}`);
}

export function findInstanceByCid(registry: InstanceRegistry, cid: bigint): string | null {
  for (const [instanceId, instanceCid] of registry) {
    if (instanceCid === cid) {
      return instanceId;
    }
  }
  return null;
}

export function getAllInstances(registry: InstanceRegistry): InstanceInfo[] {
  return Array.from(registry.entries()).map(([instanceId, cid]) => ({
    instanceId,
    cid,
  }));
}
