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
import { requestResponse } from '@/lib/websocket/request-response';
import { debugLog } from '@/lib/debug-config';

/**
 * How long to wait for the service to confirm a media session.
 *
 * The service itself waits up to 5s for the peer's UDP channel before
 * answering; this must exceed that or a slow-but-successful open would be
 * reported as a failure while the session actually came up.
 */
const MEDIA_OPEN_TIMEOUT_MS = 10_000;

export interface WebSocketCallTransportOptions {
  selfCid: bigint;
  /**
   * Only the slice of the P2P sender configuration this actually uses.
   *
   * MessageSenderConfig carries eleven members built for chat — conversation
   * stores, message listeners, delivery status. Requiring all of them to send a
   * call invite would tie calling to machinery it has nothing to do with, and
   * make it untestable without standing up a conversation store.
   */
  senderConfig: Pick<MessageSenderConfig, 'getCurrentCid'>;
}

export class WebSocketCallTransport implements CallTransport {
  constructor(private readonly options: WebSocketCallTransportOptions) {}

  async openSession(peerCid: bigint): Promise<void> {
    const client = await websocketService.getWasmClient();
    if (!client) throw new Error('Not connected');

    const requestId = crypto.randomUUID();
    debugLog('Call', 'requesting media session', { peerCid: peerCid.toString() });

    // Awaiting the service's verdict is the point: MediaOpen can fail there —
    // no UDP channel, peer gone — and a resolve-on-queue would report success
    // while the manager fans frames into a session that never existed. That
    // failure path is the one that tells the user WHY the call cannot start.
    await requestResponse<true>({
      request: {
        MediaOpen: {
          request_id: requestId,
          cid: this.options.selfCid,
          peer_cid: peerCid,
        },
      },
      requestId,
      sendRequest: (request) => client.sendDirectToInternalService(request as never),
      timeoutMs: MEDIA_OPEN_TIMEOUT_MS,
      operationName: 'MediaOpen',
      matcher: {
        matchSuccess: (message) => {
          const opened = message.MediaSessionOpened as { request_id?: string } | undefined;
          return opened?.request_id === requestId ? true : undefined;
        },
        matchFailure: (message) => {
          const failed = message.MediaSessionFailed as
            | { request_id?: string; message?: string }
            | undefined;
          if (failed?.request_id !== requestId) return undefined;
          return failed.message ?? 'the media session could not be opened';
        },
      },
    });

    debugLog('Call', 'media session opened', { peerCid: peerCid.toString() });
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
      // The cast is the narrowing above meeting a wider published signature.
      // sendP2PCommand takes the full config but reads only getCurrentCid, and
      // even that is skipped when the sender cid is supplied — as it is here.
      this.options.senderConfig as MessageSenderConfig,
      peerCid,
      { type: P2PCommandType.CallSignal, payload: signal },
      this.options.selfCid,
    );
  }
}
