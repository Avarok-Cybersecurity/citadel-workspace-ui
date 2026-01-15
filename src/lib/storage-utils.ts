/**
 * Utility functions for working with local storage in a type-safe way
 */

/**
 * JSON replacer that converts BigInt to string for serialization
 * BigInt values come from WASM responses (serde-wasm-bindgen serializes u64 as BigInt)
 */
export function bigIntReplacer(_key: string, value: any): any {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * JSON stringify that handles BigInt values
 * Use this instead of JSON.stringify when working with WASM response data
 */
export function safeJSONStringify(data: any, space?: number): string {
  return JSON.stringify(data, bigIntReplacer, space);
}

/**
 * Save data to local storage with a specific key
 * @param key Storage key
 * @param data Data to store
 */
export function saveToStorage<T>(key: string, data: T): void {
  try {
    const serializedData = JSON.stringify(data, bigIntReplacer);
    localStorage.setItem(key, serializedData);
  } catch (error) {
    console.error(`Error saving to storage with key '${key}':`, error);
  }
}

/**
 * Load data from local storage by key
 * @param key Storage key
 * @param defaultValue Default value if nothing is found
 * @returns Stored data or default value
 */
export function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const serializedData = localStorage.getItem(key);
    if (serializedData === null) {
      return defaultValue;
    }
    return JSON.parse(serializedData) as T;
  } catch (error) {
    console.error(`Error loading from storage with key '${key}':`, error);
    return defaultValue;
  }
}

/**
 * Clear a specific item from local storage
 * @param key Storage key to clear
 */
export function clearFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error clearing storage with key '${key}':`, error);
  }
}

/**
 * Clear all local storage items that match a prefix
 * @param prefix Storage key prefix to match
 */
export function clearStorageWithPrefix(prefix: string): void {
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith(prefix))
      .forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.error(`Error clearing storage with prefix '${prefix}':`, error);
  }
}
