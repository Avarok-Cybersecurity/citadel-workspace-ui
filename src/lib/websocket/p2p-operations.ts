/**
 * P2P Operations
 *
 * Handles peer-to-peer connection and messaging operations via the internal service.
 * Extracted from websocket-service.ts to reduce file size.
 */

import { requestResponse, requestResponseSoft } from './request-response';
import { debugLog, errorLog } from '../debug-config';
import { getDefaultSecuritySettings } from '../security-utils';
import { sendP2PMessage, sendP2PMessageBytes } from './p2p-message-dispatch';
import { TIMEOUT } from '../timeout-constants';

export interface P2PConfig {
  init: () => Promise<void>;
  sendMessage: (message: unknown) => Promise<void>;
  isLeader: () => boolean;
}

export class P2POperations {
  private readonly config: P2PConfig;

  constructor(config: P2PConfig) {
    this.config = config;
  }

  /** Send a P2P message to a peer. Delegates to the dispatch module. */
  async sendP2PMessage(cid: bigint, targetCid: bigint, message: string): Promise<void> {
    return sendP2PMessage(this.config, cid, targetCid, message);
  }

  /** Send raw bytes over the P2P channel. Delegates to the dispatch module. */
  async sendP2PMessageBytes(cid: bigint, targetCid: bigint, message: Uint8Array): Promise<void> {
    return sendP2PMessageBytes(this.config, cid, targetCid, message);
  }

  /**
   * Open a P2P connection with a peer.
   */
  async openP2PConnection(cid: bigint, targetCid: bigint): Promise<void> {
    await this.config.init();

    if (cid === undefined || cid === null) {
      throw new Error('CID is required to open P2P connection');
    }

    if (cid === targetCid) {
      throw new Error('Cannot open P2P connection to self');
    }

    debugLog('P2POperations', 'Opening P2P connection', { cid: cid.toString(), targetCid: targetCid.toString() });

    const requestId = crypto.randomUUID();
    const peerConnectRequest = {
      PeerConnect: {
        request_id: requestId,
        cid: cid,
        peer_cid: targetCid,
        // Enabled so a call has a datagram path. Media cannot ride the reliable
        // channel: there is no such thing as a lost packet there, so congestion
        // becomes unbounded latency instead of loss, and a call three seconds
        // behind is worse than one that dropped a frame.
        //
        // Messaging is unaffected — it keeps using the reliable channel. If UDP
        // negotiation fails the connection still comes up; only calling is lost,
        // and the media layer reports that explicitly rather than hanging.
        udp_mode: 'Enabled',
        session_security_settings: getDefaultSecuritySettings()
      }
    };

    await requestResponse<true>({
      request: peerConnectRequest, requestId, timeoutMs: TIMEOUT.P2P_CONNECT_REQUEST_MS,
      sendRequest: this.config.sendMessage,
      operationName: 'PeerConnect',
      matcher: {
        matchSuccess: (msg) => {
          const r = msg as { PeerConnectSuccess?: { request_id: string } };
          if (r.PeerConnectSuccess?.request_id === requestId) {
            debugLog('P2POperations', 'P2P connection established', { targetCid: targetCid.toString() });
            return true;
          }
          return undefined;
        },
        matchFailure: (msg) => {
          const r = msg as { PeerConnectFailure?: { request_id: string; message?: string } };
          if (r.PeerConnectFailure?.request_id === requestId) {
            const error = r.PeerConnectFailure.message || 'PeerConnect failed';
            errorLog('P2P connection failed:', error);
            return error;
          }
          return undefined;
        },
      },
    });
  }

  /**
   * Accept an incoming P2P connection request.
   * This is sent in response to PeerConnectNotification to complete the handshake.
   * Resolves on both success AND failure (warn-and-continue pattern).
   */
  async acceptPeerConnect(cid: bigint, peerCid: bigint, notification: Record<string, unknown> | null): Promise<void> {
    await this.config.init();

    if (cid === undefined || cid === null || peerCid === undefined || peerCid === null) {
      throw new Error('CID and peerCid are required to accept P2P connection');
    }

    debugLog('P2POperations', 'Accepting P2P connection', { cid: cid.toString(), peerCid: peerCid.toString() });

    const requestId = crypto.randomUUID();
    const acceptRequest = {
      PeerConnectAccept: {
        request_id: requestId,
        cid: cid,
        peer_cid: peerCid,
        accept: true,
        // Mirrors the initiator, defaulting to Enabled: a call needs BOTH ends
        // to have negotiated a datagram path, so an acceptor that quietly
        // dropped to Disabled would make every call it answered media-less.
        udp_mode: (notification?.udp_mode as string) || 'Enabled',
        session_security_settings: notification?.session_security_settings || getDefaultSecuritySettings(),
        peer_session_password: null
      }
    };

    await requestResponseSoft({
      request: acceptRequest, requestId, timeoutMs: TIMEOUT.P2P_ACCEPT_REQUEST_MS,
      sendRequest: this.config.sendMessage,
      operationName: 'PeerConnectAccept',
      matchSuccess: (msg) => {
        const r = msg as { PeerConnectAcceptSuccess?: { request_id: string } };
        if (r.PeerConnectAcceptSuccess?.request_id === requestId) {
          debugLog('P2POperations', 'P2P connection accept sent', { peerCid });
          return true;
        }
        return false;
      },
      matchFailure: (msg) => {
        const r = msg as { PeerConnectAcceptFailure?: { request_id: string; message?: string } };
        if (r.PeerConnectAcceptFailure?.request_id === requestId) {
          return r.PeerConnectAcceptFailure.message || 'PeerConnectAccept failed';
        }
        return undefined;
      },
      onTimeout: () => debugLog('P2POperations', 'PeerConnectAccept timed out - continuing with PeerConnect fallback'),
      onFailure: (error) => debugLog('P2POperations', 'PeerConnectAccept failed:', error, '- will use PeerConnect fallback'),
    });
  }

  /**
   * Disconnect from a specific P2P peer.
   * Sends PeerDisconnect request - C2S connection stays active.
   */
  async disconnectP2P(localCid: bigint, peerCid: bigint): Promise<void> {
    await this.config.init();

    if (localCid === undefined || localCid === null) {
      throw new Error('Local CID is required to disconnect P2P');
    }

    if (peerCid === undefined || peerCid === null) {
      throw new Error('Peer CID is required to disconnect P2P');
    }

    debugLog('P2POperations', 'Disconnecting P2P connection', { localCid: localCid.toString(), peerCid: peerCid.toString() });

    const requestId = crypto.randomUUID();
    const peerDisconnectRequest = {
      PeerDisconnect: { request_id: requestId, cid: localCid, peer_cid: peerCid }
    };

    await requestResponse<true>({
      request: peerDisconnectRequest, requestId, timeoutMs: TIMEOUT.P2P_DISCONNECT_MS,
      sendRequest: this.config.sendMessage,
      operationName: 'PeerDisconnect',
      matcher: {
        matchSuccess: (msg) => {
          const r = msg as {
            PeerDisconnectSuccess?: { request_id: string };
            DisconnectNotification?: { request_id?: string; peer_cid?: bigint };
          };
          if (r.PeerDisconnectSuccess?.request_id === requestId) {
            debugLog('P2POperations', 'P2P disconnect successful', { peerCid: peerCid.toString() });
            return true;
          }
          if (r.DisconnectNotification) {
            const n = r.DisconnectNotification;
            if (n.request_id === requestId || n.peer_cid === peerCid) {
              debugLog('P2POperations', 'P2P disconnect notification received', { peerCid: peerCid.toString() });
              return true;
            }
          }
          return undefined;
        },
        matchFailure: (msg) => {
          const r = msg as { PeerDisconnectFailure?: { request_id: string; message?: string } };
          if (r.PeerDisconnectFailure?.request_id === requestId) {
            const error = r.PeerDisconnectFailure.message || 'PeerDisconnect failed';
            errorLog('P2P disconnect failed:', error);
            return error;
          }
          return undefined;
        },
      },
    });
  }
}
