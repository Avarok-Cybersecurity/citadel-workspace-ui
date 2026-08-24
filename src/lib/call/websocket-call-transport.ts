/**
 * The real CallTransport, over the app's existing WebSocket client.
 *
 * Everything call-specific lives behind the CallTransport interface, so this
 * file is only translation: call intent in, InternalServiceRequest out. The
 * orchestration it serves is tested against a fake of this same interface.
 */

import { websocketService } from '@/lib/websocket-service';
import { sendP2PCommand } from '@/lib/p2p/message-send-operations';
import { P2PCommandType, type CallSignalPayload } from '@/types/p2p-commands';
import type { MessageSenderConfig } from '@/lib/p2p/message-sender-types';
import type { CallTransport } from './call-transport';
import type { WireFrame } from './frame-codec';
import { debugLog } from '@/lib/debug-config';

export interface WebSocketCallTransportOptions {
  selfCid: bigint;
  /** Reuses the app's existing P2P send configuration rather than a second one. */
  senderConfig: MessageSenderConfig;
}

export class WebSocketCallTransport implements CallTransport {
  constructor(private readonly options: WebSocketCallTransportOptions) {}

  async openSession(peerCid: bigint): Promise<void> {
    const client = await websocketService.getWasmClient();
    if (!client) throw new Error('Not connected');

    await client.sendDirectToInternalService({
      MediaOpen: {
        request_id: crypto.randomUUID(),
        cid: this.options.selfCid,
        peer_cid: peerCid,
      },
    } as never);

    debugLog('Call', 'requested media session', { peerCid: peerCid.toString() });
  }

  async closeSession(peerCid: bigint): Promise<void> {
    const client = await websocketService.getWasmClient();
    if (!client) return;

    await client.sendDirectToInternalService({
      MediaClose: {
        request_id: crypto.randomUUID(),
        cid: this.options.selfCid,
        peer_cid: peerCid,
      },
    } as never);
  }

  sendFrame(peerCid: bigint, frame: WireFrame): void {
    // Deliberately not awaited, and deliberately not routed through the generic
    // request path: at 30-60 frames a second per track, a promise and a full
    // request serialization per frame is pure overhead for a result nobody
    // inspects.
    // getClient(), not getWasmClient(): the async variant awaits init(), and a
    // frame path cannot afford an await per frame. By the time frames flow the
    // client is initialised, so the synchronous accessor is the correct one.
    const client = websocketService.getClient();
    if (!client) return;

    try {
      client.sendMediaFrame(
        this.options.selfCid,
        peerCid,
        frame.track,
        frame.kind,
        frame.timestamp,
        frame.flags,
        frame.payload,
      );
    } catch (error) {
      // One frame failing is not worth ending a call over; the next one is
      // 16 milliseconds away.
      debugLog('Call', 'frame send failed', error);
    }
  }

  async sendSignal(peerCid: bigint, signal: CallSignalPayload): Promise<void> {
    // Call control goes on the RELIABLE path while the media it sets up goes on
    // the lossy one. Losing a video frame costs a sixtieth of a second; losing
    // a "call ended" leaves both sides staring at a call that is over.
    await sendP2PCommand(
      this.options.senderConfig,
      peerCid,
      { type: P2PCommandType.CallSignal, payload: signal },
      this.options.selfCid,
    );
  }
}
