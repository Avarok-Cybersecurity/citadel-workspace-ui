/**
 * Debug configuration for controlling console output
 */

import { formatForDebug } from './debug-formatter';

export interface DebugConfig {
  enableVerboseLogging: boolean;
  enabledCategories: Set<string>;
}

// Load config from localStorage or use defaults
const loadConfig = (): DebugConfig => {
  try {
    const stored = localStorage.getItem('debug-config');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        enableVerboseLogging: parsed.enableVerboseLogging ?? false,
        enabledCategories: new Set(parsed.enabledCategories ?? ['errors', 'connection'])
      };
    }
  } catch (e) {
    // Ignore errors and use defaults
  }
  
  return {
    enableVerboseLogging: process.env.NODE_ENV === 'development',
    enabledCategories: new Set(['errors', 'connection', 'auth'])
  };
};

export const DEBUG_CONFIG = loadConfig();

/**
 * Update debug configuration
 */
export function updateDebugConfig(updates: Partial<DebugConfig>) {
  if (updates.enableVerboseLogging !== undefined) {
    DEBUG_CONFIG.enableVerboseLogging = updates.enableVerboseLogging;
  }
  if (updates.enabledCategories) {
    DEBUG_CONFIG.enabledCategories = updates.enabledCategories;
  }
  
  // Save to localStorage
  try {
    localStorage.setItem('debug-config', JSON.stringify({
      enableVerboseLogging: DEBUG_CONFIG.enableVerboseLogging,
      enabledCategories: Array.from(DEBUG_CONFIG.enabledCategories)
    }));
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Format a value for debug output, ensuring byte arrays are properly truncated
 */
export function formatForLog(value: any): string {
  const formatted = formatForDebug(value);
  // formatForDebug returns an object, so we need to stringify it
  return JSON.stringify(formatted, null, 2);
}

/**
 * Debug logging function with category filtering
 */
export function debugLog(category: string, message: string, ...args: any[]) {
  if (!DEBUG_CONFIG.enableVerboseLogging && !DEBUG_CONFIG.enabledCategories.has(category)) {
    return;
  }
  
  const formattedArgs = args.map(arg => {
    try {
      return formatForLog(arg);
    } catch (e) {
      return String(arg);
    }
  });
  
  console.log(`[${category}] ${message}`, ...formattedArgs);
}

/**
 * Always log errors regardless of config
 */
export function errorLog(message: string, ...args: any[]) {
  const formattedArgs = args.map(arg => {
    try {
      return formatForLog(arg);
    } catch (e) {
      return String(arg);
    }
  });
  
  console.error(`[ERROR] ${message}`, ...formattedArgs);
}

// Make formatter available globally for WASM
if (typeof window !== 'undefined') {
  (window as any).__citadelDebugFormatter = formatForLog;
}

// Make debug functions available globally for console access
if (typeof window !== 'undefined') {
  (window as any).debugConfig = {
    enable: () => updateDebugConfig({ enableVerboseLogging: true }),
    disable: () => updateDebugConfig({ enableVerboseLogging: false }),
    enableCategory: (cat: string) => {
      const cats = new Set(DEBUG_CONFIG.enabledCategories);
      cats.add(cat);
      updateDebugConfig({ enabledCategories: cats });
    },
    disableCategory: (cat: string) => {
      const cats = new Set(DEBUG_CONFIG.enabledCategories);
      cats.delete(cat);
      updateDebugConfig({ enabledCategories: cats });
    },
    status: () => ({
      verboseLogging: DEBUG_CONFIG.enableVerboseLogging,
      enabledCategories: Array.from(DEBUG_CONFIG.enabledCategories)
    })
  };
  
  console.log('Debug config available via window.debugConfig - use .enable(), .disable(), .enableCategory(name), .disableCategory(name), .status()');
}