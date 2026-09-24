/**
 * WebSocket Service - Barrel Export
 */
export type { WebSocketServiceConfig } from './types';
export { WebSocketServiceCore } from './core';
import { WebSocketServiceCore } from './core';
import { eventEmitter } from '../event-emitter';
import { errorLog } from '../debug-config';
import { instanceManager } from '../multi-instance/instance-manager';
import { installFollowerSessionClaims } from '../multi-instance/follower-session-claims';
import { isOwnedByALiveConnection } from '../sessions/claim-session';
import { instanceChannel } from '../multi-instance/instance-channel';
import { TIMEOUT } from '../timeout-constants';

// Singleton instance - preserves original API
export const websocketService: WebSocketServiceCore = new WebSocketServiceCore();

// The leader carries every tab's sessions on its one connection; see follower-session-claims.ts.
installFollowerSessionClaims({
  on: (event: string, handler: (payload: unknown) => void): void => { eventEmitter.on(event, handler); },
  isLeader: (): boolean => instanceManager.isLeader,
  selfInstanceId: (): string => instanceManager.instanceId,
  instances: () => instanceManager.getAllInstances(),
  claim: (cid: bigint): Promise<unknown> => websocketService.claimSession(cid, true),
  isOwnedByALiveConnection,
  reportFailure: (cid: bigint, error: unknown): void => { errorLog('FollowerSessionClaims', `claiming ${cid} for another tab failed`, error); },
  requestReports: (): void => instanceChannel.requestCidReport(),
  unregister: (instanceId: string): void => instanceManager.unregisterInstance(instanceId),
  reportWindowMs: TIMEOUT.CID_REPORT_WINDOW_MS,
  schedule: (fn: () => void, ms: number): void => { setTimeout(fn, ms); },
});
