/**
 * P2P Auto-Connect Service Module
 *
 * Re-exports all public API from the split module files.
 * Consuming files can import from '@/lib/p2p-auto-connect-service' unchanged.
 */

// Types (originally exported from the monolith)
export type { PeerConnectionInfo } from './types';

// Main Service class + singleton (originally exported from the monolith)
export { P2PAutoConnectService } from './service';

import { P2PAutoConnectService } from './service';
export const p2pAutoConnectService = P2PAutoConnectService.getInstance();
