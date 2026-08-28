/**
 * WebSocket Service - Barrel Export
 */
export type { WebSocketServiceConfig } from './types';
export { WebSocketServiceCore } from './core';
import { WebSocketServiceCore } from './core';

// Singleton instance - preserves original API
export const websocketService: WebSocketServiceCore = new WebSocketServiceCore();
