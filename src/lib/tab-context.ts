/**
 * Tab Context Manager
 * Provides tab-specific storage and identification using IndexedDB.
 *
 * IndexedDB uses Structured Clone which handles BigInt natively.
 * No JSON serialization or revivers needed.
 *
 * All functions are async - callers must await.
 */

import { dbPut, dbGet, dbDelete } from './storage-utils';

// Generate or retrieve a unique tab identifier
// Note: Tab ID is a simple string, so sessionStorage is fine for this
export function getTabId(): string {
  let tabId = sessionStorage.getItem('citadel-tab-id');

  if (!tabId) {
    tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('citadel-tab-id', tabId);
  }

  return tabId;
}

// Storage key prefixes
const TAB_PREFIX = 'tab-';
const SHARED_PREFIX = 'shared-';

export function getTabSpecificKey(key: string): string {
  return `${TAB_PREFIX}${getTabId()}-${key}`;
}

export function getSharedKey(key: string): string {
  return `${SHARED_PREFIX}${key}`;
}

/**
 * Store tab-specific data in IndexedDB.
 * BigInt values are preserved via Structured Clone.
 */
export async function setTabData<T>(key: string, value: T): Promise<void> {
  const storageKey = getTabSpecificKey(key);
  await dbPut('tabContext', storageKey, value);
}

/**
 * Retrieve tab-specific data from IndexedDB.
 * BigInt values are automatically restored.
 */
export async function getTabData<T>(key: string): Promise<T | null> {
  const storageKey = getTabSpecificKey(key);
  const data = await dbGet<T>('tabContext', storageKey);
  return data ?? null;
}

/**
 * Remove tab-specific data from IndexedDB.
 */
export async function removeTabData(key: string): Promise<void> {
  const storageKey = getTabSpecificKey(key);
  await dbDelete('tabContext', storageKey);
}

/**
 * Store shared data (accessible across tabs) in IndexedDB.
 * BigInt values are preserved via Structured Clone.
 */
export async function setSharedData<T>(key: string, value: T): Promise<void> {
  const storageKey = getSharedKey(key);
  await dbPut('keyValue', storageKey, value);
}

/**
 * Retrieve shared data from IndexedDB.
 * BigInt values are automatically restored.
 */
export async function getSharedData<T>(key: string): Promise<T | null> {
  const storageKey = getSharedKey(key);
  const data = await dbGet<T>('keyValue', storageKey);
  return data ?? null;
}

/**
 * Remove shared data from IndexedDB.
 */
export async function removeSharedData(key: string): Promise<void> {
  const storageKey = getSharedKey(key);
  await dbDelete('keyValue', storageKey);
}

// Tab context interface for managing selected user
export interface TabUserContext {
  selectedUsername?: string;
  selectedServerAddress?: string;
  selectedCid?: bigint;
}

/**
 * Get the currently selected user for this tab.
 */
export async function getSelectedUser(): Promise<TabUserContext | null> {
  return getTabData<TabUserContext>('selected-user');
}

/**
 * Set the selected user for this tab.
 */
export async function setSelectedUser(user: TabUserContext): Promise<void> {
  await setTabData('selected-user', user);
}

/**
 * Clear the selected user for this tab.
 */
export async function clearSelectedUser(): Promise<void> {
  await removeTabData('selected-user');
}
