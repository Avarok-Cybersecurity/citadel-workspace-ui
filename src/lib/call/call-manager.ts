/**
 * Call orchestration: signalling in, state out, media sessions opened and closed
 * at the right moments.
 *
 * All I/O is injected (see CallTransport), so the ordering rules here can be
 * tested directly. The ordering is the whole difficulty — a media session opened
 * before the peer accepted wastes a UDP channel on a call that may never happen,
 * and one opened after frames start arriving drops the beginning of the call.
 *
 * Inbound signal handling and session open/close live in their own modules
 * (call-signal-handling, media-session-lifecycle) behind CallManagerInternals.
 */

import type {
  CallCodecCapabilities,
  CallDeclineReason,
  CallEndReason,
  CallMediaKinds,
  CallSignalPayload,
} from '@/types/p2p-commands';
import { canAddParticipant, reduce, type CallEvent, type CallState } from './call-state';
import type { CallTransport } from './call-transport';
import type { WireFrame } from './frame-codec';
import { PeerCodecBook } from './peer-codec-book';
import { MEDIA_WIRE_VERSION, RING_TIMEOUT_MS } from './call-constants';
import type { CallManagerInternals } from './call-manager-internals';
import { handleInboundSignal } from './call-signal-handling';
import { closeAllSessions, openSessionFor } from './media-session-lifecycle';

export { MEDIA_WIRE_VERSION, RING_TIMEOUT_MS } from './call-constants';

export interface CallManagerOptions {
  transport: CallTransport;
  selfCid: bigint;
  capabilities: CallCodecCapabilities;
  /** Injected so tests are not at the mercy of a real clock. */
  now: () => number;
  /** Injected timer (returns a cancel), same reasoning as `now`. */
  schedule: (fn: () => void, delayMs: number) => () => void;
  onStateChanged: (state: CallState | null) => void;
  /** A peer's decoder is stuck and needs our encoder to produce a keyframe. */
  onKeyframeRequested: (track: number) => void;
}

export class CallManager {
  private state: CallState | null = null;
  /** Peers we have an open media session with, so close is exact. */
  private readonly openSessions = new Set<bigint>();
  /** Codec facts peers told us; consumed by the provider's codec sync. */
  readonly codecs = new PeerCodecBook();
  private cancelRingTimeout: (() => void) | null = null;

  constructor(private readonly options: CallManagerOptions) {}

  getState(): CallState | null {
    return this.state;
  }

  private apply(event: CallEvent): void {
    const next = reduce(this.state, event);
    if (next === this.state) return;
    this.state = next;
    // The ring timer only guards the un-answered outgoing state; any progress
    // or terminal transition retires it.
    if (next && next.status !== 'ringing-out' && this.cancelRingTimeout) {
      this.cancelRingTimeout();
      this.cancelRingTimeout = null;
    }
    this.options.onStateChanged(next);
  }

  /** The face the extracted signal/session modules operate on. */
  private internals(): CallManagerInternals {
    return {
      transport: this.options.transport,
      capabilities: this.options.capabilities,
      codecs: this.codecs,
      openSessions: this.openSessions,
      getState: () => this.state,
      apply: (event) => this.apply(event),
      keyframeRequested: (track) => this.options.onKeyframeRequested(track),
    };
  }

  /** Place a call. Signals every invitee, but opens no media session yet. */
  async start(
    callId: string,
    invitees: Array<{ cid: bigint; username: string }>,
    media: CallMediaKinds,
    roomId: string | null,
    videoSendCodec: string | null,
  ): Promise<void> {
    this.codecs.clear();
    this.apply({ type: 'invite-sent', callId, roomId, media, invitees });
    // Armed here, cleared by apply() on any progress: without it an unanswered
    // call rings forever with the microphone captured.
    this.cancelRingTimeout = this.options.schedule(() => {
      if (this.state?.status === 'ringing-out') void this.end('unanswered');
    }, RING_TIMEOUT_MS);

    const invite: CallSignalPayload = {
      kind: 'CallInvite',
      call_id: callId,
      media,
      codecs: this.options.capabilities,
      media_wire_version: MEDIA_WIRE_VERSION,
      video_send_codec: videoSendCodec,
      ...(roomId
        ? { group: { room_id: roomId, members: invitees.map((i) => i.cid.toString()) } }
        : {}),
    };

    // Sent in parallel: a slow or unreachable peer must not delay ringing
    // everyone else in a group call.
    await Promise.all(
      invitees.map((invitee) =>
        this.options.transport.sendSignal(invitee.cid, invite).catch(() => {
          // A signal that cannot be sent is that peer failing to be invited, not
          // the call failing. They simply never ring.
          this.apply({ type: 'peer-declined', cid: invitee.cid, reason: 'unsupported' });
        }),
      ),
    );
  }

  /** Handle inbound call control from a peer. */
  async handleSignal(from: bigint, username: string, signal: CallSignalPayload): Promise<void> {
    return handleInboundSignal(this.internals(), from, username, signal);
  }

  /** Answer the ringing call. */
  async accept(media: CallMediaKinds, videoSendCodec: string | null): Promise<void> {
    const state = this.state;
    if (!state || state.status !== 'ringing-in') return;

    this.apply({ type: 'accepted-locally', media });

    const peers = [...state.participants.keys()];
    await Promise.all(
      peers.map((cid) =>
        this.options.transport.sendSignal(cid, {
          kind: 'CallAccept',
          call_id: state.callId,
          codecs: this.options.capabilities,
          media,
          video_send_codec: videoSendCodec,
        }),
      ),
    );
    // Opened after the accept is on the wire, so the peer is already expecting
    // frames by the time the session exists.
    await Promise.all(peers.map((cid) => openSessionFor(this.internals(), cid)));
  }

  async decline(reason: CallDeclineReason): Promise<void> {
    const state = this.state;
    if (!state) return;

    const peers = [...state.participants.keys()];
    this.apply({ type: 'declined-locally', reason });
    const decline: CallSignalPayload = { kind: 'CallDecline', call_id: state.callId, reason };
    await Promise.all(
      peers.map((cid) => this.options.transport.sendSignal(cid, decline).catch(() => undefined)),
    );
  }

  /** Leave or cancel the call, telling everyone and releasing every session. */
  async end(reason: CallEndReason): Promise<void> {
    const state = this.state;
    if (!state) return;

    const peers = [...state.participants.keys()];
    const bye: CallSignalPayload = { kind: 'CallEnd', call_id: state.callId, reason };
    await Promise.all(
      peers.map((cid) => this.options.transport.sendSignal(cid, bye).catch(() => undefined)),
    );
    await closeAllSessions(this.internals());
    this.apply({ type: 'ended', reason });
  }

  /** Tell peers the microphone or camera changed, so their tiles stay honest. */
  async setSelfMedia(media: CallMediaKinds): Promise<void> {
    const state = this.state;
    if (!state) return;

    this.apply({ type: 'self-media-changed', media });
    const update: CallSignalPayload = { kind: 'CallMediaState', call_id: state.callId, media };
    await Promise.all(
      [...state.participants.keys()].map((cid) =>
        this.options.transport.sendSignal(cid, update).catch(() => undefined),
      ),
    );
  }

  /**
   * Tell peers our send codec changed after renegotiation.
   *
   * The caller only learns the callee's decode list from the accept, so the
   * codec announced in the invite can turn out to be undecodable there; the
   * peers' decoders are configured from these announcements, so a silent
   * switch would be a permanently black tile on their side.
   */
  async announceSendCodec(codec: string | null): Promise<void> {
    const state = this.state;
    if (!state || state.status === 'ended' || state.status === 'failed') return;

    await Promise.all(
      [...state.participants.values()]
        .filter((p) => p.status !== 'left' && p.status !== 'declined')
        .map((p) =>
          this.options.transport
            .sendSignal(p.cid, {
              kind: 'CallMediaState',
              call_id: state.callId,
              media: state.selfMedia,
              video_send_codec: codec,
            })
            .catch(() => undefined),
        ),
    );
  }

  /** Fan one encoded frame out to every participant who is in the call. */
  sendFrame(frame: WireFrame): void {
    const state = this.state;
    if (!state) return;

    for (const participant of state.participants.values()) {
      if (participant.status !== 'active' && participant.status !== 'connecting') continue;
      if (!this.openSessions.has(participant.cid)) continue;
      this.options.transport.sendFrame(participant.cid, frame);
    }
  }

  async requestKeyframe(from: bigint, track: number): Promise<void> {
    const state = this.state;
    if (!state) return;
    await this.options.transport
      .sendSignal(from, { kind: 'CallKeyframeRequest', call_id: state.callId, track })
      .catch(() => undefined);
  }

  markConnected(cid: bigint): void {
    this.apply({ type: 'peer-connected', cid });
  }

  canAdd(withVideo: boolean): boolean {
    return this.state ? canAddParticipant(this.state, withVideo) : true;
  }
}
