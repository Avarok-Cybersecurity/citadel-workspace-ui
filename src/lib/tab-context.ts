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

const TAB_ID_KEY = 'citadel-tab-id';

function mintTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** This tab's identity, which every `tab-*` storage key is scoped by. */
export function getTabId(): string {
  let tabId = sessionStorage.getItem(TAB_ID_KEY);

  if (!tabId) {
    tabId = mintTabId();
    sessionStorage.setItem(TAB_ID_KEY, tabId);
  }

  return tabId;
}

/**
 * Give this tab a new identity, because another tab was found using the same one.
 *
 * Browsers COPY sessionStorage on Duplicate Tab, so the twins shared this id —
 * and with it every `tab-<id>-*` key, including the selected session. Switching
 * session in one twin rewrote what the other read next, and the CID self-heal
 * then stamped each instance with whatever the shared tab context said, which
 * is how two instances came to claim one CID in the routing map.
 *
 * `reissueInstanceId` already existed for exactly this reason and re-rolled the
 * INSTANCE id only. The tab id is the one the storage keys use.
 */
export function reissueTabId(): string {
  const replacement = mintTabId();
  sessionStorage.setItem(TAB_ID_KEY, replacement);
  return replacement;
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
