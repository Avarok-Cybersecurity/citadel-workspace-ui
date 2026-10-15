/**
 * The telemetry requests bound to this tab's workspace session. Components and hooks import this
 * rather than the sender-taking operations, so a test replaces the one I/O boundary.
 */
import type {
  CurrentTerms, MyConsent, TelemetryAccessLogEntry, TelemetryFilter, TelemetryPage, TelemetryPageResult, TelemetrySettings,
} from 'citadel-workspace-client-ts';
import WorkspaceService from '@/lib/workspace-service';
import * as ops from '@/lib/workspace-service/telemetry-operations';

export interface TelemetryApi {
  getTerms: () => Promise<CurrentTerms>;
  getMyConsent: () => Promise<MyConsent>;
  acceptTerms: (platformVersion: number, workspaceVersion: number | null) => Promise<MyConsent>;
  setConsent: (enabled: boolean) => Promise<MyConsent>;
  deleteMine: () => Promise<number>;
  list: (filter: TelemetryFilter, page: TelemetryPage) => Promise<TelemetryPageResult>;
  getSettings: () => Promise<TelemetrySettings>;
  setPolicy: (retentionDays: number, perUserBytes: bigint) => Promise<TelemetrySettings>;
  setSupportAccess: (enabled: boolean, untilMs: bigint | null) => Promise<TelemetrySettings>;
  accessLog: () => Promise<TelemetryAccessLogEntry[]>;
  setWorkspaceTerms: (text: string | null) => Promise<CurrentTerms>;
}

export const telemetryApi: TelemetryApi = {
  getTerms: () => ops.getTerms(WorkspaceService),
  getMyConsent: () => ops.getMyConsent(WorkspaceService),
  acceptTerms: (platformVersion: number, workspaceVersion: number | null) => ops.acceptTerms(WorkspaceService, platformVersion, workspaceVersion),
  setConsent: (enabled: boolean) => ops.setTelemetryConsent(WorkspaceService, enabled),
  deleteMine: () => ops.deleteMyTelemetry(WorkspaceService),
  list: (...args: [Parameters<typeof ops.listTelemetry>[1], Parameters<typeof ops.listTelemetry>[2]]) => ops.listTelemetry(WorkspaceService, ...args),
  getSettings: () => ops.getTelemetrySettings(WorkspaceService),
  setPolicy: (retentionDays: number, perUserBytes: bigint) => ops.setTelemetryPolicy(WorkspaceService, retentionDays, perUserBytes),
  setSupportAccess: (enabled: boolean, untilMs: bigint | null) => ops.setSupportAccess(WorkspaceService, enabled, untilMs),
  accessLog: () => ops.listTelemetryAccessLog(WorkspaceService),
  setWorkspaceTerms: (text: string | null) => ops.setWorkspaceTerms(WorkspaceService, text),
};
