/**
 * P2P Operations
 *
 * Handles peer-to-peer connection and messaging operations via the internal service.
 * Extracted from websocket-service.ts to reduce file size.
 */

import { eventEmitter } from '../event-emitter';
import { debugLog, errorLog } from '../debug-config';

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

  /**
   * Send a P2P message to a peer.
   */
  async sendP2PMessage(cid: bigint, targetCid: bigint, message: string): Promise<void> {
    await this.config.init();

    if (cid === undefined || cid === null) {
      throw new Error('CID is required to send P2P message');
    }

    if (targetCid === undefined || targetCid === null) {
      throw new Error('Target CID (peer_cid) is required to send P2P message');
    }

    console.log('[P2P] sendP2PMessage called with:', {
      cid: cid.toString(),
      cidType: typeof cid,
      targetCid: targetCid.toString(),
      targetCidType: typeof targetCid,
      messageLength: message.length
    });

    // Create InternalServiceRequest::Message with peer_cid to route to P2P channel
    const messageRequest = {
      Message: {
        request_id: crypto.randomUUID(),
        message: Array.from(new TextEncoder().encode(message)),
        cid: cid,
        peer_cid: targetCid,
        security_level: 'Standard'
      }
    };

    console.log('[P2P] messageRequest before conversion:', JSON.stringify(messageRequest, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    debugLog('websocket', 'Sending P2P message', { cid: cid.toString(), targetCid: targetCid.toString(), messageLength: message.length });

    await this.config.sendMessage(messageRequest);
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

    debugLog('websocket', 'Opening P2P connection', { cid: cid.toString(), targetCid: targetCid.toString() });

    const requestId = crypto.randomUUID();
    const peerConnectRequest = {
      PeerConnect: {
        request_id: requestId,
        cid: cid,
        peer_cid: targetCid,
        udp_mode: 'Disabled',
        session_security_settings: {
          security_level: 'Standard',
          secrecy_mode: 'BestEffort',
          crypto_params: {
            encryption_algorithm: 'AES_GCM_256',
            kem_algorithm: 'Kyber',
            sig_algorithm: 'None'
          },
          header_obfuscator_settings: 'Disabled'
        }
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('PeerConnect request timed out'));
      }, 30000);

      const handler = (message: Record<string, unknown>) => {
        const msg = message as {
          PeerConnectSuccess?: { request_id: string };
          PeerConnectFailure?: { request_id: string; message?: string };
        };
        if (msg.PeerConnectSuccess && msg.PeerConnectSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          debugLog('websocket', 'P2P connection established', { targetCid: targetCid.toString() });
          resolve();
        } else if (msg.PeerConnectFailure && msg.PeerConnectFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          const error = msg.PeerConnectFailure.message || 'PeerConnect failed';
          errorLog('P2P connection failed:', error);
          reject(new Error(error));
        }
      };

      eventEmitter.on('websocket-message', handler);

      this.config.sendMessage(peerConnectRequest).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        reject(error);
      });
    });
  }

  /**
   * Accept an incoming P2P connection request.
   * This is sent in response to PeerConnectNotification to complete the handshake.
   */
  async acceptPeerConnect(cid: bigint, peerCid: bigint, notification: Record<string, unknown> | null): Promise<void> {
    await this.config.init();

    if (cid === undefined || cid === null || peerCid === undefined || peerCid === null) {
      throw new Error('CID and peerCid are required to accept P2P connection');
    }

    debugLog('websocket', 'Accepting P2P connection', { cid: cid.toString(), peerCid: peerCid.toString() });

    const requestId = crypto.randomUUID();
    const acceptRequest = {
      PeerConnectAccept: {
        request_id: requestId,
        cid: cid,
        peer_cid: peerCid,
        accept: true,
        udp_mode: (notification?.udp_mode as string) || 'Disabled',
        session_security_settings: notification?.session_security_settings || {
          security_level: 'Standard',
          secrecy_mode: 'BestEffort',
          crypto_params: {
            encryption_algorithm: 'AES_GCM_256',
            kem_algorithm: 'Kyber',
            sig_algorithm: 'None'
          },
          header_obfuscator_settings: 'Disabled'
        },
        peer_session_password: null
      }
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        console.warn('PeerConnectAccept timed out - continuing with PeerConnect fallback');
        resolve();
      }, 10000);

      const handler = (message: Record<string, unknown>) => {
        const msg = message as {
          PeerConnectAcceptSuccess?: { request_id: string };
          PeerConnectAcceptFailure?: { request_id: string; message?: string };
        };
        if (msg.PeerConnectAcceptSuccess && msg.PeerConnectAcceptSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          debugLog('websocket', 'P2P connection accept sent', { peerCid });
          resolve();
        } else if (msg.PeerConnectAcceptFailure && msg.PeerConnectAcceptFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          const error = msg.PeerConnectAcceptFailure.message || 'PeerConnectAccept failed';
          console.warn('PeerConnectAccept failed:', error, '- will use PeerConnect fallback');
          resolve();
        }
      };

      eventEmitter.on('websocket-message', handler);

      this.config.sendMessage(acceptRequest).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        console.warn('Failed to send PeerConnectAccept:', error);
        resolve();
      });
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

    debugLog('websocket', 'Disconnecting P2P connection', { localCid: localCid.toString(), peerCid: peerCid.toString() });

    const requestId = crypto.randomUUID();
    const peerDisconnectRequest = {
      PeerDisconnect: {
        request_id: requestId,
        cid: localCid,
        peer_cid: peerCid
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('PeerDisconnect request timed out'));
      }, 10000);

      const handler = (message: Record<string, unknown>) => {
        const msg = message as {
          PeerDisconnectSuccess?: { request_id: string };
          PeerDisconnectFailure?: { request_id: string; message?: string };
          DisconnectNotification?: { request_id?: string; peer_cid?: bigint };
        };

        if (msg.PeerDisconnectSuccess && msg.PeerDisconnectSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          debugLog('websocket', 'P2P disconnect successful', { peerCid: peerCid.toString() });
          resolve();
        }
        else if (msg.DisconnectNotification) {
          const notification = msg.DisconnectNotification;
          if (notification.request_id === requestId || notification.peer_cid === peerCid) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);
            debugLog('websocket', 'P2P disconnect notification received', { peerCid: peerCid.toString() });
            resolve();
          }
        }
        else if (msg.PeerDisconnectFailure && msg.PeerDisconnectFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          const error = msg.PeerDisconnectFailure.message || 'PeerDisconnect failed';
          errorLog('P2P disconnect failed:', error);
          reject(new Error(error));
        }
      };

      eventEmitter.on('websocket-message', handler);

      this.config.sendMessage(peerDisconnectRequest).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        reject(error);
      });
    });
  }
}
