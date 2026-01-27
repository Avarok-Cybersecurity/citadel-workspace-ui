/**
 * Connection State Manager
 *
 * Manages the single source of truth for connection state.
 * Follows SBIO principle - pure state operations only.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                        CID LIFECYCLE - CRITICAL INFO                         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║ CID (Client ID) is a persistent 64-bit identifier assigned per account.      ║
 * ║ Only Register creates a new CID. All reconnection scenarios preserve CID.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import type {
  StoredSession,
  StoredSessions,
  ActiveSession,
} from '@/types/session-types';
import type { CurrentConnectionInfo, PendingRequest } from './types';
import { CACHE_TTL_MS, MAX_RECONNECT_ATTEMPTS } from './constants';

export class ConnectionState {
  // Core state
  private _isInitialized = false;
  private _storedSessions: StoredSessions = { sessions: [] };
  private _currentConnectionInfo: CurrentConnectionInfo | null = null;
  private _isLeader = false;
  private _reconnectAttempts = 0;

  // Ready promise for initialization
  private _readyPromise: Promise<void>;
  private _readyResolve: (() => void) | null = null;

  // Pending requests for response tracking
  private _pendingRequests = new Map<string, PendingRequest>();

  // Session cache for deduplication
  private _pendingGetSessions: Promise<ActiveSession[]> | null = null;
  private _cachedSessions: ActiveSession[] | null = null;
  private _cachedSessionsTimestamp = 0;

  // Concurrency guard for connection attempts
  private _connectionAttempts = new Set<string>();

  // Cleanup functions for event listeners
  private _cleanupFunctions: (() => void)[] = [];

  constructor() {
    this._readyPromise = new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });
  }

  // ============================================================================
  // Initialization State
  // ============================================================================

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  setInitialized(value: boolean): void {
    this._isInitialized = value;
  }

  get readyPromise(): Promise<void> {
    return this._readyPromise;
  }

  resolveReady(): void {
    if (this._readyResolve) {
      this._readyResolve();
      this._readyResolve = null;
    }
  }

  // ============================================================================
  // Leader State
  // ============================================================================

  get isLeader(): boolean {
    return this._isLeader;
  }

  setLeader(value: boolean): void {
    this._isLeader = value;
  }

  // ============================================================================
  // Connection Info
  // ============================================================================

  get currentConnectionInfo(): CurrentConnectionInfo | null {
    return this._currentConnectionInfo;
  }

  setCurrentConnectionInfo(info: CurrentConnectionInfo | null): void {
    console.log('[ConnectionState] setCurrentConnectionInfo called:', {
      newCid: info?.cid?.toString() ?? 'null',
      newUsername: info?.username ?? 'null',
      oldCid: this._currentConnectionInfo?.cid?.toString() ?? 'null',
      oldUsername: this._currentConnectionInfo?.username ?? 'null',
      stack: new Error().stack?.split('\n').slice(1, 5).join(' <- '),
    });
    this._currentConnectionInfo = info;
  }

  updateCurrentConnectionInfo(partial: Partial<CurrentConnectionInfo>): void {
    if (this._currentConnectionInfo) {
      this._currentConnectionInfo = { ...this._currentConnectionInfo, ...partial };
    } else if (partial.cid !== undefined) {
      this._currentConnectionInfo = { cid: partial.cid, ...partial };
    }
  }

  // ============================================================================
  // Stored Sessions
  // ============================================================================

  get storedSessions(): StoredSessions {
    return this._storedSessions;
  }

  setStoredSessions(sessions: StoredSessions): void {
    this._storedSessions = sessions;
  }

  getActiveSessionIndex(): number {
    return this._storedSessions.activeSessionIndex ?? 0;
  }

  setActiveSessionIndex(index: number): void {
    if (index >= 0 && index < this._storedSessions.sessions.length) {
      this._storedSessions.activeSessionIndex = index;
    }
  }

  findSession(username: string, serverAddress: string): StoredSession | undefined {
    return this._storedSessions.sessions.find(
      (s) => s.username === username && s.serverAddress === serverAddress
    );
  }

  findSessionIndex(username: string, serverAddress: string): number {
    return this._storedSessions.sessions.findIndex(
      (s) => s.username === username && s.serverAddress === serverAddress
    );
  }

  addOrUpdateSession(session: StoredSession): void {
    const existingIndex = this.findSessionIndex(session.username, session.serverAddress);
    if (existingIndex >= 0) {
      this._storedSessions.sessions[existingIndex] = session;
    } else {
      this._storedSessions.sessions.push(session);
    }
  }

  removeSession(username: string, serverAddress: string): void {
    this._storedSessions.sessions = this._storedSessions.sessions.filter(
      (s) => !(s.username === username && s.serverAddress === serverAddress)
    );
  }

  clearSessions(): void {
    this._storedSessions = { sessions: [] };
  }

  clearSessionCids(): void {
    for (const session of this._storedSessions.sessions) {
      session.cid = undefined;
    }
  }

  getSessionsArray(): StoredSession[] {
    return [...this._storedSessions.sessions];
  }

  // ============================================================================
  // Reconnect Attempts
  // ============================================================================

  get reconnectAttempts(): number {
    return this._reconnectAttempts;
  }

  incrementReconnectAttempts(): number {
    this._reconnectAttempts++;
    return this._reconnectAttempts;
  }

  resetReconnectAttempts(): void {
    this._reconnectAttempts = 0;
  }

  hasReachedMaxReconnectAttempts(): boolean {
    return this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS;
  }

  get maxReconnectAttempts(): number {
    return MAX_RECONNECT_ATTEMPTS;
  }

  // ============================================================================
  // Pending Requests
  // ============================================================================

  getPendingRequest(requestId: string): PendingRequest | undefined {
    return this._pendingRequests.get(requestId);
  }

  setPendingRequest(requestId: string, request: PendingRequest): void {
    this._pendingRequests.set(requestId, request);
  }

  deletePendingRequest(requestId: string): boolean {
    return this._pendingRequests.delete(requestId);
  }

  hasPendingRequest(requestId: string): boolean {
    return this._pendingRequests.has(requestId);
  }

  // ============================================================================
  // Session Cache
  // ============================================================================

  get cachedSessions(): ActiveSession[] | null {
    return this._cachedSessions;
  }

  isCacheValid(): boolean {
    if (!this._cachedSessions) return false;
    return (Date.now() - this._cachedSessionsTimestamp) < CACHE_TTL_MS;
  }

  setCachedSessions(sessions: ActiveSession[]): void {
    this._cachedSessions = sessions;
    this._cachedSessionsTimestamp = Date.now();
  }

  invalidateCache(): void {
    this._cachedSessions = null;
    this._cachedSessionsTimestamp = 0;
  }

  get pendingGetSessions(): Promise<ActiveSession[]> | null {
    return this._pendingGetSessions;
  }

  setPendingGetSessions(promise: Promise<ActiveSession[]> | null): void {
    this._pendingGetSessions = promise;
  }

  // ============================================================================
  // Connection Attempts Guard
  // ============================================================================

  hasConnectionAttempt(key: string): boolean {
    return this._connectionAttempts.has(key);
  }

  addConnectionAttempt(key: string): void {
    this._connectionAttempts.add(key);
  }

  removeConnectionAttempt(key: string): void {
    this._connectionAttempts.delete(key);
  }

  // ============================================================================
  // Cleanup Functions
  // ============================================================================

  addCleanupFunction(fn: () => void): void {
    this._cleanupFunctions.push(fn);
  }

  executeCleanup(): void {
    for (const cleanup of this._cleanupFunctions) {
      cleanup();
    }
    this._cleanupFunctions = [];
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Extract CID from error message like "session already connected (cid = 123)"
   */
  extractCidFromErrorMessage(message: string): string | null {
    const cidMatch = message.match(/cid\s*=\s*(\d+)/i);
    return cidMatch ? cidMatch[1] : null;
  }

  /**
   * Create a connection key for deduplication.
   */
  createConnectionKey(username: string, serverAddress: string): string {
    return `${username}@${serverAddress}`;
  }

  /**
   * Calculate exponential backoff delay.
   */
  calculateBackoffDelay(attempt: number, maxDelay: number): number {
    return Math.min(1000 * Math.pow(2, attempt), maxDelay);
  }
}
