/**
 * Storage utilities using IndexedDB for native BigInt support.
 *
 * IndexedDB uses the Structured Clone algorithm which handles BigInt natively.
 * No JSON.stringify/parse, no revivers/replacers - data is stored as-is.
 */

import { openDB, IDBPDatabase, DBSchema } from 'idb';
import { errorLog, warnLog } from './debug-config';
import { DB_NAME, DB_VERSION, runMigrations, missingStores } from './storage-migrations';

// ============================================================================
// Database Schema
// ============================================================================

/**
 * Schema for the Citadel IndexedDB database.
 * All stores use string keys and support any value type (Structured Clone handles BigInt).
 */
interface CitadelDBSchema extends DBSchema {
  /** Key-value store for general data (replaces localStorage) */
  keyValue: {
    key: string;
    value: unknown;
  };
  /** Session data store */
  sessions: {
    key: string;
    value: unknown;
  };
  /** Message/conversation data store */
  messages: {
    key: string;
    value: unknown;
  };
  /** Peer registration data store */
  peers: {
    key: string;
    value: unknown;
  };
  /** Tab context data store (replaces sessionStorage) */
  tabContext: {
    key: string;
    value: unknown;
  };
  /** Instance management data store */
  instances: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<CitadelDBSchema>> | null = null;

/**
 * Get or create the IndexedDB database instance.
 * Uses a singleton pattern for efficiency.
 */
/**
 * How long to wait after being told we are blocked before giving up.
 *
 * Generous: a cooperating tab closes its handle in `blocking` within a tick,
 * so reaching this means the holder is a build that predates that handler, or
 * a frozen tab. Either way it will not resolve on its own.
 */
const BLOCKED_GIVE_UP_MS = 10_000;

export function getDB(): Promise<IDBPDatabase<CitadelDBSchema>> {
  if (!dbPromise) {
    let rejectBlocked: ((reason: Error) => void) | null = null;
    // Rejects only if `blocked` actually fired, so a slow-but-progressing
    // upgrade is never killed by a timer.
    const blockedGuard = new Promise<never>((_, reject) => {
      rejectBlocked = reject;
    });

    const opening = openDB<CitadelDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, tx) {
        runMigrations(db, oldVersion, newVersion, tx);

        const missing = missingStores(db.objectStoreNames);
        if (missing.length > 0) {
          // The migration list has drifted from the schema. Failing here aborts
          // the upgrade transaction and keeps the old database, which is far
          // easier to diagnose than a NotFoundError from an unrelated read later.
          throw new Error(
            `Schema v${newVersion ?? DB_VERSION} is missing object stores after migration: ${missing.join(', ')}`
          );
        }
      },

      /**
       * Another tab is still holding the previous version open, so this upgrade
       * cannot start. Without this the open() call simply never settles and the
       * app hangs with no explanation — and this app is explicitly multi-tab, so
       * it is the normal case during an update, not an edge case.
       */
      blocked(currentVersion, blockedVersion) {
        const detail =
          `Database upgrade to v${blockedVersion} is blocked by another tab still on v${currentVersion}. ` +
          'Close other Citadel tabs to finish updating.';
        warnLog('Storage', detail);
        // Warning alone does NOT settle the open, which is what the comment
        // above always claimed it did. An unsettled open means every awaiting
        // caller hangs — including the sign-out flow, which puts a
        // full-viewport blocking modal up BEFORE its first read, leaving the
        // whole app unusable until a reload. Give up after a grace period so
        // callers get an error they can show instead of a pending promise.
        setTimeout(() => {
          rejectBlocked?.(new Error(detail));
        }, BLOCKED_GIVE_UP_MS);
      },

      /**
       * THIS tab is the one holding an old version open while another tab tries
       * to upgrade. Closing our connection lets that upgrade proceed; the next
       * database call transparently reopens at the new version.
       */
      blocking(currentVersion, blockedVersion) {
        warnLog(
          'Storage',
          `Closing our v${currentVersion} connection so another tab can upgrade to v${blockedVersion}`
        );
        void dbPromise?.then(db => db.close());
        dbPromise = null;
      },

      /**
       * The browser closed the connection unexpectedly (storage eviction, or the
       * user cleared site data). Dropping the cached promise means the next call
       * reopens rather than reusing a dead handle forever.
       */
      terminated() {
        errorLog('Storage', 'Database connection terminated unexpectedly; will reopen on next use');
        dbPromise = null;
      },
    }).catch(error => {
      // A VersionError means the on-disk database is NEWER than this build asks
      // for — the user ran a newer version, then loaded an older one (a stale
      // cached bundle, or a rollback). IndexedDB has no downgrade, so say that
      // plainly instead of surfacing an opaque DOMException.
      dbPromise = null;
      if (error instanceof DOMException && error.name === 'VersionError') {
        errorLog(
          'Storage',
          `Local database is newer than this version of Citadel expects (wants v${DB_VERSION}). ` +
            'This usually means an older build was loaded from cache — reload to get the current version.',
          error
        );
      }
      throw error;
    });

    // The guard only ever rejects; if the open wins, it wins normally.
    dbPromise = Promise.race([opening, blockedGuard]).catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

// ============================================================================
// Generic IndexedDB Operations
// ============================================================================

type StoreName = 'keyValue' | 'sessions' | 'messages' | 'peers' | 'tabContext' | 'instances';

/**
 * Put a value into an IndexedDB store.
 * BigInt values are preserved via Structured Clone.
 */
export async function dbPut<S extends StoreName>(store: S, key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put(store, value, key);
}

/**
 * Get a value from an IndexedDB store.
 * BigInt values are automatically restored.
 */
export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await getDB();
  const result = await db.get(store, key);
  return result as T | undefined;
}

/**
 * Delete a value from an IndexedDB store.
 */
export async function dbDelete(store: StoreName, key: string): Promise<void> {
  const db = await getDB();
  await db.delete(store, key);
}

// ============================================================================
// Synchronous Fallback (for legacy callers during migration)
// These use localStorage but will be deprecated
// ============================================================================

// ============================================================================
// JSON Helpers for Logging (BigInt → String for display only)
// ============================================================================

/**
 * JSON replacer that converts BigInt to string for display/logging.
 * Use this ONLY for logging purposes, not for storage.
 */
function bigIntToString(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * JSON stringify that handles BigInt values for logging/display.
 * Converts BigInt to string representation.
 */
export function safeJSONStringify(data: unknown, space?: number): string {
  return JSON.stringify(data, bigIntToString, space);
}
