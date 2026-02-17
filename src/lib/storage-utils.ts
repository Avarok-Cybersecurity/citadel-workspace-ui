/**
 * Storage utilities using IndexedDB for native BigInt support.
 *
 * IndexedDB uses the Structured Clone algorithm which handles BigInt natively.
 * No JSON.stringify/parse, no revivers/replacers - data is stored as-is.
 */

import { openDB, IDBPDatabase, DBSchema } from 'idb';
import { debugLog } from './debug-config';

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

const DB_NAME = 'citadel-workspace';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<CitadelDBSchema>> | null = null;

/**
 * Get or create the IndexedDB database instance.
 * Uses a singleton pattern for efficiency.
 */
export function getDB(): Promise<IDBPDatabase<CitadelDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<CitadelDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create all object stores
        if (!db.objectStoreNames.contains('keyValue')) {
          db.createObjectStore('keyValue');
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions');
        }
        if (!db.objectStoreNames.contains('messages')) {
          db.createObjectStore('messages');
        }
        if (!db.objectStoreNames.contains('peers')) {
          db.createObjectStore('peers');
        }
        if (!db.objectStoreNames.contains('tabContext')) {
          db.createObjectStore('tabContext');
        }
        if (!db.objectStoreNames.contains('instances')) {
          db.createObjectStore('instances');
        }
      },
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

/**
 * @deprecated Use dbPut for new code. This is for backward compatibility.
 * Save data to localStorage (synchronous fallback).
 * Note: BigInt values will be converted to strings.
 */
export function saveToStorage<T>(key: string, data: T): void {
  try {
    const serializedData = JSON.stringify(data, bigIntToString);
    localStorage.setItem(key, serializedData);
  } catch (error) {
    debugLog('StorageUtils', `Error saving to storage with key '${key}':`, error);
  }
}

/**
 * @deprecated Use dbGet for new code. This is for backward compatibility.
 * Load data from localStorage (synchronous fallback).
 * Note: BigInt values stored as strings will be restored.
 */
export function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const serializedData = localStorage.getItem(key);
    if (serializedData === null) {
      return defaultValue;
    }
    return JSON.parse(serializedData, stringToBigInt) as T;
  } catch (error) {
    debugLog('StorageUtils', `Error loading from storage with key '${key}':`, error);
    return defaultValue;
  }
}

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
 * JSON reviver that converts known CID fields back to BigInt.
 * @deprecated Only used for legacy localStorage fallback.
 */
function stringToBigInt(key: string, value: unknown): unknown {
  const cidKeys = ['cid', 'peer_cid', 'session_cid', 'selectedCid', 'fromCid', 'toCid', 'ownerId', 'senderId', 'peerCid', 'targetCid'];
  if (
    cidKeys.includes(key) &&
    typeof value === 'string' &&
    /^\d+$/.test(value)
  ) {
    try {
      return BigInt(value);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * JSON stringify that handles BigInt values for logging/display.
 * Converts BigInt to string representation.
 */
export function safeJSONStringify(data: unknown, space?: number): string {
  return JSON.stringify(data, bigIntToString, space);
}
