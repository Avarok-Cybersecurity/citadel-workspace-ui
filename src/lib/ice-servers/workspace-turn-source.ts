/**
 * The production relay source: the cache over the workspace transport.
 * Loaded lazily through `lazyTurnSource`; see there.
 */
import { IceServersCache } from './cache';
import { turnSourceFrom, type TurnSource } from './peer-connect-turn';
import { workspaceIceServersPort, type WorkspaceIcePortDeps } from './workspace-port';

/** Memory only, one per caller: relay credentials are never persisted. */
export function createWorkspaceTurnSource(deps: WorkspaceIcePortDeps): TurnSource {
  return turnSourceFrom(new IceServersCache(workspaceIceServersPort(deps), Date.now));
}
