/**
 * Debug formatter utilities to prevent large byte arrays from polluting console logs
 * Mirrors the Rust debug formatting logic for bytes and maps
 */

const SAMPLE_ENDS_COUNT = 5;

/**
 * Format byte arrays for debug output, showing only first and last few bytes
 */
function formatBytes(bytes: number[] | Uint8Array): string {
  const len = bytes.length;
  if (len <= SAMPLE_ENDS_COUNT * 2) {
    return `{BytesLike(len: ${len}, values: [${Array.from(bytes).join(', ')}])}`;
  }
  
  const first = Array.from(bytes).slice(0, SAMPLE_ENDS_COUNT);
  const last = Array.from(bytes).slice(-SAMPLE_ENDS_COUNT);
  
  return `{BytesLike(len: ${len}, First ${SAMPLE_ENDS_COUNT} bytes: [${first.join(', ')}], Last ${SAMPLE_ENDS_COUNT} bytes: [${last.join(', ')}])}`;
}

/**
 * Format maps with byte array values for debug output
 */
function formatBytesMap(map: Record<string, number[] | Uint8Array>): string {
  const entries = Object.entries(map).map(([key, value]) => {
    return `(K: ${key}, V: ${formatBytes(value)})`;
  });
  
  return `{MapLike: ${entries.join(', ')}}`;
}

/**
 * Recursively format an object for debug output, replacing byte arrays with formatted strings
 */
export function formatForDebug(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // Handle BigInt values by converting to string
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    // Check if it's a byte array (all elements are numbers 0-255)
    if (obj.length > 0 && obj.every(v => typeof v === 'number' && v >= 0 && v <= 255)) {
      return formatBytes(obj);
    }
    return obj.map(item => formatForDebug(item));
  }

  if (typeof obj === 'string') {
    // Try converting to json map
    try {
      const json = JSON.parse(obj);
      obj = json;
    } catch {
      return obj;
    }
  }
  
  // Handle objects
  if (typeof obj === 'object') {
    const formatted: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Special handling for known byte fields
      if (shouldFormatAsBytes(key, value)) {
        formatted[key] = formatBytes(value as number[]);
      }
      // Special handling for known map fields with byte values
      else if (shouldFormatAsBytesMap(key, value)) {
        formatted[key] = formatBytesMap(value as Record<string, number[]>);
      }
      // Recursively format other fields
      else {
        formatted[key] = formatForDebug(value);
      }
    }
    
    return formatted;
  }
  
  return obj;
}

/**
 * Check if a field should be formatted as bytes based on its name and value
 */
function shouldFormatAsBytes(fieldName: string, value: any): boolean {
  // Check if it's an array of numbers
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  
  // Known byte fields from Rust structs
  const byteFields = [
    'value',      // LocalDBGetKVSuccess, LocalDBSetKV
    'message',    // GroupMessageNotification, Message, GroupMessage
    'password',   // Connect
    'proposed_password', // Register
    'metadata',   // Workspace types: Workspace, Office, Room
    'contents',   // SendMessage in workspace protocol
  ];
  
  // Check if field name matches and all elements are byte values
  return byteFields.includes(fieldName) && 
         value.every((v: any) => typeof v === 'number' && v >= 0 && v <= 255);
}

/**
 * Check if a field should be formatted as a map of bytes
 */
function shouldFormatAsBytesMap(fieldName: string, value: any): boolean {
  // Check if it's an object
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  
  // Known map fields from Rust structs
  if (fieldName !== 'map') {
    return false;
  }
  
  // Check if all values in the map are byte arrays
  for (const val of Object.values(value)) {
    if (!Array.isArray(val) || !val.every((v: any) => typeof v === 'number' && v >= 0 && v <= 255)) {
      return false;
    }
  }
  
  return true;
}