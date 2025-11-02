/**
 * Example showing how WASM debug bridge handles various log formats
 */

import { setupWasmDebugBridge } from './wasm-debug-bridge';

// This simulates what the WASM code might send
export function demonstrateWasmDebugBridge() {
  // Setup the bridge
  setupWasmDebugBridge();
  
  console.log('=== WASM Debug Bridge Examples ===\n');
  
  // Example 1: Plain text log
  console.log('Example 1: Plain text');
  (window as any).wasmDebugLog('Connection established to server at 192.168.1.1:8080');
  
  // Example 2: JSON only
  console.log('\nExample 2: JSON only');
  (window as any).wasmDebugLog('{"event": "peer_connected", "peer_id": 12345, "timestamp": 1234567890}');
  
  // Example 3: Mixed content - common pattern
  console.log('\nExample 3: Mixed content - event with data');
  (window as any).wasmDebugLog('Received message from peer 12345: {"type": "chat", "content": "Hello!", "metadata": {"sent_at": 1234567890}}');
  
  // Example 4: Multiple JSON objects in log
  console.log('\nExample 4: Multiple JSON objects');
  (window as any).wasmDebugLog('Request: {"method": "GET", "path": "/api/data"} Response: {"status": 200, "data": [1, 2, 3]}');
  
  // Example 5: Byte array formatting
  console.log('\nExample 5: Byte array in JSON');
  (window as any).wasmDebugLog('Decrypted payload: {"message": "secret", "key": [72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 33]}');
  
  // Example 6: Complex nested structure
  console.log('\nExample 6: Complex nested structure');
  (window as any).wasmDebugLog('Workspace state: {"workspace": {"id": "ws123", "members": [{"id": 1, "name": "Alice", "publicKey": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]}, {"id": 2, "name": "Bob"}]}}');
  
  // Example 7: Error with stack trace
  console.log('\nExample 7: Error logging');
  (window as any).wasmDebugLog('ERROR: Connection failed {"error": "timeout", "details": {"host": "192.168.1.1", "port": 8080, "attempts": 3}}');
  
  // Example 8: Performance metrics
  console.log('\nExample 8: Performance metrics');
  (window as any).wasmDebugLog('Performance: {"operation": "encrypt", "duration_ms": 45, "input_size": 1024, "output_size": 1056} completed successfully');
  
  console.log('\n=== Examples Complete ===');
}

// Export for use in tests or demos
export { setupWasmDebugBridge };