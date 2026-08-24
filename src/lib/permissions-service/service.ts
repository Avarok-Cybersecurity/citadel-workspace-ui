/**
 * Permissions Service - Service Class
 *
 * Singleton that fetches, caches, and provides permission checks.
 * Extends EventListenerManager for automatic event listener cleanup.
 */

import { eventEmitter } from '@/lib/event-emitter';
import WorkspaceService from '@/lib/workspace-service';
import { connectionManager } from '@/lib/connection';
import { EventListenerManager } from '@/lib/utils/event-listener-manager';
import { debugLog } from '@/lib/debug-config';
import { TIMEOUT, INTERVAL } from '@/lib/timeout-constants';

import { Permission, PERMISSION_LABELS } from './types';
import type { UserRole, DomainPermissions } from './types';
import {
  updateCacheEntry,
  hasPermission as cacheHasPermission,
  getRole as cacheGetRole,
  getDeniedReason as cacheGetDeniedReason,
} from './cache';

/**
 * Permissions Service singleton
 */
export class PermissionsService extends EventListenerManager {
  private static instance: PermissionsService;
  private cache: Map<string, DomainPermissions> = new Map();
  private pendingRequests: Map<string, Promise<DomainPermissions>> = new Map();
  private initialized = false;

  private constructor() {
    super();
    this.setupEventListeners();
  }

  public static getInstance(): PermissionsService {
    if (!PermissionsService.instance) {
      PermissionsService.instance = new PermissionsService();
    }
    return PermissionsService.instance;
  }

  /**
   * Setup event listeners for permission updates.
   */
  protected setupEventListeners(): void {
    this.listen<{
      userId: string;
      role: UserRole;
      permissions: string[];
      domainId: string;
    }>('user:permissions:loaded', (payload) => {
      // Synchronous fast path FIRST. Resolving asynchronously in every case
      // filled the cache a tick later than it used to, and consumers that read
      // straight after this event — the permissions settings tab among them —
      // began rendering against an empty cache.
      //
      // The async fallback exists because the synchronous accessor is null for a
      // user who logged IN rather than registering, which made this equality
      // check fail for every response and left the cache permanently empty.
      if (payload.userId === this.getCurrentUserId()) {
        updateCacheEntry(this.cache, payload.domainId, payload.role, payload.permissions);
        return;
      }

      void this.isCurrentUser(payload.userId).then((mine) => {
        if (mine) {
          updateCacheEntry(this.cache, payload.domainId, payload.role, payload.permissions);
          // Only emitted on the async path: the synchronous one has already
          // updated the cache before any listener could observe it missing.
          this.emit('permissions:updated', { domainId: payload.domainId });
        }
      });
    });

    this.listen<{
      userId: string;
      domainId: string;
      permissions: string[];
      operation: 'add' | 'remove' | 'set';
    }>('member:permissions-updated', async (payload) => {
      if (await this.isCurrentUser(payload.userId)) {
        await this.fetchPermissions(payload.domainId, true);
        this.emit('permissions:updated', { domainId: payload.domainId });
      }
    });

    this.listen<{ userId: string; role: UserRole }>('member:role-updated', (payload) => {
      void this.isCurrentUser(payload.userId).then((mine) => {
        if (mine) {
          this.clearCache();
          this.emit('permissions:role-changed', { role: payload.role });
        }
      });
    });

    this.initialized = true;
  }

  private getCurrentUserId(): string | null {
    const connectionInfo = connectionManager.getConnectionInfo();
    return connectionInfo?.username || null;
  }

  /**
   * The current user, resolved from whichever source actually knows.
   *
   * `currentConnectionInfo.username` is empty for a user who logged IN rather
   * than registering, so the synchronous lookup above returns null and every
   * fetch below bailed with "No current user, cannot fetch permissions". The
   * cache then stayed empty, and because a permission check against an unloaded
   * domain returns false, EVERY gate in the app denied — a workspace's own admin
   * saw the same UI as a stranger, with nothing logged above debug level.
   *
   * The tab-selected session is the authoritative record of who is signed in
   * here; it is async (IndexedDB-backed), which is why this is separate from the
   * synchronous accessor the event listeners use for their equality checks.
   */
  /** Whether `userId` is the signed-in user, resolved from whichever source knows. */
  private async isCurrentUser(userId: string): Promise<boolean> {
    return userId === (await this.resolveCurrentUserId());
  }

  private async resolveCurrentUserId(): Promise<string | null> {
    const fromConnection = this.getCurrentUserId();
    if (fromConnection) return fromConnection;

    const session = await connectionManager.getTabSelectedSession();
    return session?.username ?? null;
  }

  /**
   * Fetch permissions for a specific domain.
   */
  public async fetchPermissions(domainId: string, forceRefresh = false): Promise<DomainPermissions | null> {
    if (!forceRefresh) {
      const cached = this.cache.get(domainId);
      if (cached && Date.now() - cached.lastUpdated < INTERVAL.PERMISSION_CACHE_MS) {
        return cached;
      }
    }

    const pending = this.pendingRequests.get(domainId);
    if (pending) return pending;

    const userId = await this.resolveCurrentUserId();
    if (!userId) {
      debugLog('PermissionsService', 'No current user, cannot fetch permissions');
      return null;
    }

    const requestPromise = (async () => {
      try {
        await WorkspaceService.getUserPermissions(userId, domainId);

        return new Promise<DomainPermissions>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Permission fetch timeout'));
          }, TIMEOUT.PERMISSION_FETCH_MS);

          const handler = (payload: { domainId: string }) => {
            if (payload.domainId === domainId) {
              clearTimeout(timeout);
              eventEmitter.off('user:permissions:loaded', handler);
              const cached = this.cache.get(domainId);
              if (cached) {
                resolve(cached);
              } else {
                reject(new Error('Permissions not found in cache after load'));
              }
            }
          };

          eventEmitter.on('user:permissions:loaded', handler);
        });
      } finally {
        this.pendingRequests.delete(domainId);
      }
    })();

    this.pendingRequests.set(domainId, requestPromise);
    return requestPromise;
  }

  // ─── Permission Checks (delegated to cache module) ───────────────

  public hasPermission(domainId: string, permission: Permission): boolean {
    return cacheHasPermission(this.cache, domainId, permission);
  }

  public hasAnyPermission(domainId: string, permissions: Permission[]): boolean {
    return permissions.some((p) => this.hasPermission(domainId, p));
  }

  public hasAllPermissions(domainId: string, permissions: Permission[]): boolean {
    return permissions.every((p) => this.hasPermission(domainId, p));
  }

  public getPermissions(domainId: string): DomainPermissions | null {
    return this.cache.get(domainId) || null;
  }

  public getAllCachedPermissions(): Map<string, DomainPermissions> {
    return new Map(this.cache);
  }

  public getRole(domainId: string): UserRole | null {
    return cacheGetRole(this.cache, domainId);
  }

  public isAdmin(domainId: string): boolean {
    const role = this.getRole(domainId);
    return role === 'Admin';
  }

  public isOwner(domainId: string): boolean {
    const role = this.getRole(domainId);
    return role === 'Owner' || role === 'Admin';
  }

  public clearCache(): void {
    this.cache.clear();
    debugLog('PermissionsService', 'Cache cleared');
  }

  public cleanup(): void {
    this.clearCache();
    this.teardown();
    this.initialized = false;
  }

  public getPermissionLabel(permission: Permission): string {
    return PERMISSION_LABELS[permission] || permission;
  }

  public getDeniedReason(domainId: string, permission: Permission): string {
    return cacheGetDeniedReason(this.cache, domainId, permission);
  }
}
