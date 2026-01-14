/**
 * Tab Context Manager
 * Provides tab-specific storage and identification
 * 
 * This allows different browser tabs to maintain independent selected user state
 * while still sharing user data across tabs when appropriate.
 */

// Generate or retrieve a unique tab identifier
export function getTabId(): string {
  // Check if we already have a tab ID in sessionStorage
  let tabId = sessionStorage.getItem('citadel-tab-id');
  
  if (!tabId) {
    // Generate a new unique tab ID
    tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('citadel-tab-id', tabId);
  }
  
  return tabId;
}

// Storage key prefixes for tab-specific data
const TAB_PREFIX = 'citadel-tab-';
const SHARED_PREFIX = 'citadel-shared-';

/**
 * Get tab-specific storage key
 * @param key The base key
 * @returns A tab-specific storage key
 */
export function getTabSpecificKey(key: string): string {
  const tabId = getTabId();
  return `${TAB_PREFIX}${tabId}-${key}`;
}

/**
 * Get shared storage key (accessible across tabs)
 * @param key The base key
 * @returns A shared storage key
 */
export function getSharedKey(key: string): string {
  return `${SHARED_PREFIX}${key}`;
}

/**
 * Store tab-specific data
 * @param key The storage key
 * @param value The value to store
 */
export function setTabData<T>(key: string, value: T): void {
  const storageKey = getTabSpecificKey(key);
  sessionStorage.setItem(storageKey, JSON.stringify(value));
}

/**
 * Retrieve tab-specific data
 * @param key The storage key
 * @returns The stored value or null
 */
export function getTabData<T>(key: string): T | null {
  const storageKey = getTabSpecificKey(key);
  const data = sessionStorage.getItem(storageKey);
  
  if (data) {
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to parse tab data:', error);
      return null;
    }
  }
  
  return null;
}

/**
 * Remove tab-specific data
 * @param key The storage key
 */
export function removeTabData(key: string): void {
  const storageKey = getTabSpecificKey(key);
  sessionStorage.removeItem(storageKey);
}

/**
 * Store shared data (accessible across tabs)
 * @param key The storage key
 * @param value The value to store
 */
export function setSharedData<T>(key: string, value: T): void {
  const storageKey = getSharedKey(key);
  localStorage.setItem(storageKey, JSON.stringify(value));
}

/**
 * Retrieve shared data
 * @param key The storage key
 * @returns The stored value or null
 */
export function getSharedData<T>(key: string): T | null {
  const storageKey = getSharedKey(key);
  const data = localStorage.getItem(storageKey);
  
  if (data) {
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to parse shared data:', error);
      return null;
    }
  }
  
  return null;
}

/**
 * Remove shared data
 * @param key The storage key
 */
export function removeSharedData(key: string): void {
  const storageKey = getSharedKey(key);
  localStorage.removeItem(storageKey);
}

// Tab context interface for managing selected user
export interface TabUserContext {
  selectedUsername?: string;
  selectedServerAddress?: string;
  selectedCid?: string;
}

/**
 * Get the currently selected user for this tab
 * @returns The selected user context or null
 */
export function getSelectedUser(): TabUserContext | null {
  return getTabData<TabUserContext>('selected-user');
}

/**
 * Set the selected user for this tab
 * @param user The user context to select
 */
export function setSelectedUser(user: TabUserContext): void {
  setTabData('selected-user', user);
}

/**
 * Clear the selected user for this tab
 */
export function clearSelectedUser(): void {
  removeTabData('selected-user');
}