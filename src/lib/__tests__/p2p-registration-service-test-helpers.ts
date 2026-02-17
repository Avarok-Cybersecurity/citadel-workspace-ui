/**
 * Shared test setup for p2p-registration-service tests.
 */

import { vi } from 'vitest';
import { websocketService } from '../websocket-service';
import { connectionManager } from '../connection';

// Helper to mock sendRequest with response data (sendRequest returns void but tests
// verify response handling, so we need to bypass the void return type)
export const mockSendRequest = vi.mocked(websocketService.sendRequest) as any as ReturnType<typeof vi.fn>;

/** Standard mock connection info for tests */
export const MOCK_CONNECTION_INFO = { cid: 12345n };

/** Create a mock ListAllPeersResponse */
export function createPeersResponse(peers: Array<{ cid: string; username: string; fullName?: string }>) {
  return {
    ListAllPeersResponse: { peers }
  };
}

/** Create a mock ListRegisteredPeersResponse */
export function createRegisteredResponse(peers: string[]) {
  return {
    ListRegisteredPeersResponse: { peers }
  };
}

/** Create a mock PeerRegisterSuccess response */
export function createRegisterSuccessResponse(cid: string, peerCid: string) {
  return {
    PeerRegisterSuccess: { cid, peer_cid: peerCid }
  };
}

/** Create a mock PeerRegisterFailure response */
export function createRegisterFailureResponse(cid: string, peerCid: string, message: string) {
  return {
    PeerRegisterFailure: { cid, peer_cid: peerCid, message }
  };
}

/** Create a mock PeerConnectSuccess response */
export function createConnectSuccessResponse(cid: string, peerCid: string) {
  return {
    PeerConnectSuccess: { cid, peer_cid: peerCid }
  };
}

/** Set up standard mock connection info */
export function setupMockConnection() {
  vi.mocked(connectionManager.getConnectionInfo).mockReturnValue(MOCK_CONNECTION_INFO);
}
