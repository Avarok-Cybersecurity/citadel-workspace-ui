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
  CallDeclineReason,
  CallEndReason,
  CallMediaKinds,
  CallSignalPayload,
} from '@/types/p2p-commands';
import { canAddParticipant, type CallEvent, type CallState } from './call-state';
import { reduce } from './call-reducer';
import type { WireFrame } from './frame-codec';
import { PeerCodecBook } from './peer-codec-book';
import { MEDIA_WIRE_VERSION } from './call-constants';
import { CallDeadline } from './call-deadline';
import type { CallManagerInternals, CallManagerOptions } from './call-manager-internals';

// The manager's two contracts live together in call-manager-internals: what a
// caller must supply, and what the extracted collaborators are allowed to see.
export type { CallManagerOptions } from './call-manager-internals';
import { CallLivenessBinding } from './call-liveness-binding';
import { announceSendCodec, handleInboundSignal } from './call-signal-handling';
import { closeAllSessions, openSessionFor } from './media-session-lifecycle';

export { MEDIA_WIRE_VERSION, RING_TIMEOUT_MS } from './call-constants';

export class CallManager {
  private state: CallState | null = null;
  /** Peers we have an open media session with, so close is exact. */
  private readonly openSessions = new Set<bigint>();
  /** Codec facts peers told us; consumed by the provider's codec sync. */
  readonly codecs = new PeerCodecBook();
  private readonly deadline: CallDeadline;

  /** Watches for peers going silent; see call-liveness-binding. */
  private readonly liveness: CallLivenessBinding;

  constructor(private readonly options: CallManagerOptions) {
    this.liveness = new CallLivenessBinding(options, () => this.internals());
    this.deadline = new CallDeadline({
      schedule: options.schedule,
      getStatus: () => this.state?.status ?? null,
      onExpired: (status) => {
        if (status !== 'connecting') return void this.end('unanswered');
        this.apply({ type: 'failed', reason: 'The call could not connect.' });
        void closeAllSessions(this.internals());
      },
    });
  }

  getState(): CallState | null {
    return this.state;
  }

  private apply(event: CallEvent): void {
    const next = reduce(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.deadline.observeState(next);
    this.liveness.observeState(next);
    this.options.onStateChanged(next);
  }

  /** The face the extracted signal/session modules operate on. */
  private internals(): CallManagerInternals {
    return {
      transport: this.options.transport,
      selfCid: this.options.selfCid,
      capabilities: this.options.capabilities,
      codecs: this.codecs,
      openSessions: this.openSessions,
      getState: () => this.state,
      apply: (event) => this.apply(event),
      keyframeRequested: (track) => this.options.onKeyframeRequested(track),
      observedLink: (cid) => this.options.observedLink?.(cid),
      linkReported: (link) => this.options.onLinkReported?.(link),
      peerSeen: (cid) => this.liveness.peerSeen(cid),
      resolvePeerName: (cid) => this.options.resolvePeerName(cid),
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
    // apply() arms the ringing-out deadline; see call-deadline.
    this.apply({ type: 'invite-sent', callId, roomId, media, invitees });

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

    // Everyone still expected in the call hears the accept — in a group that
    // includes co-invitees who have not answered yet, which is how two
    // invitees find each other without the caller relaying anything.
    const peers = [...state.participants.values()].filter(
      (p) => p.status !== 'left' && p.status !== 'declined',
    );
    //
    // Per-peer catch, like every other fan-out in this file. Without it
    // Promise.all rejects on the first unreachable co-invitee and never reaches
    // openSessionFor below, so NO session opens with anyone — including the
    // caller — while we have already moved to `connecting`. Group rosters come
    // from room membership rather than connected peers, so that is the normal
    // case there; in 1:1 this list is just the caller. Hence group-only.
    await Promise.all(
      peers.map((p) =>
        this.options.transport
          .sendSignal(p.cid, {
            kind: 'CallAccept',
            call_id: state.callId,
            codecs: this.options.capabilities,
            media,
            video_send_codec: videoSendCodec,
          })
          .catch(() => undefined),
      ),
    );
    // Opened after the accept is on the wire, so the peer is already expecting
    // frames by the time the session exists — and only where BOTH sides have
    // answered: the caller (in the call by dialling, seeded 'connecting') and
    // any co-invitee whose accept already arrived. The rest get their session
    // when their CallAccept lands.
    const ready = peers.filter((p) => p.status === 'connecting' || p.status === 'active');
    await Promise.all(ready.map((p) => openSessionFor(this.internals(), p.cid)));
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

  /** Tell peers our send codec changed; the why lives with the implementation
   *  in call-signal-handling. */
  async announceSendCodec(codec: string | null): Promise<void> {
    return announceSendCodec(this.internals(), codec);
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
