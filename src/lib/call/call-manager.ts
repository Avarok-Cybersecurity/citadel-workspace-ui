/**
 * Call orchestration: signalling in, state out, media sessions opened and closed
 * at the right moments.
 *
 * All I/O is injected (see CallTransport), so the ordering rules here can be
 * tested directly. The ordering is the whole difficulty — a media session opened
 * before the peer accepted wastes a UDP channel on a call that may never happen,
 * and one opened after frames start arriving drops the beginning of the call.
 */

import type {
  CallCodecCapabilities,
  CallDeclineReason,
  CallEndReason,
  CallMediaKinds,
  CallSignalPayload,
} from '@/types/p2p-commands';
import {
  canAddParticipant,
  glareWinner,
  reduce,
  type CallEvent,
  type CallState,
} from './call-state';
import type { CallTransport } from './call-transport';
import type { WireFrame } from './frame-codec';

/** Bumped when the frame wire format changes. */
export const MEDIA_WIRE_VERSION = 1;

/** How long an unanswered call rings before giving up. */
export const RING_TIMEOUT_MS = 45_000;

export interface CallManagerOptions {
  transport: CallTransport;
  selfCid: bigint;
  capabilities: CallCodecCapabilities;
  /** Injected so tests are not at the mercy of a real clock. */
  now: () => number;
  onStateChanged: (state: CallState | null) => void;
}

export class CallManager {
  private state: CallState | null = null;
  /** Peers we have an open media session with, so close is exact. */
  private readonly openSessions = new Set<bigint>();

  constructor(private readonly options: CallManagerOptions) {}

  getState(): CallState | null {
    return this.state;
  }

  private apply(event: CallEvent): void {
    const next = reduce(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.options.onStateChanged(next);
  }

  /** Place a call. Signals every invitee, but opens no media session yet. */
  async start(
    callId: string,
    invitees: Array<{ cid: bigint; username: string }>,
    media: CallMediaKinds,
    roomId: string | null,
  ): Promise<void> {
    this.apply({ type: 'invite-sent', callId, roomId, media, invitees });

    const invite: CallSignalPayload = {
      kind: 'CallInvite',
      call_id: callId,
      media,
      codecs: this.options.capabilities,
      media_wire_version: MEDIA_WIRE_VERSION,
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
    switch (signal.kind) {
      case 'CallInvite':
        return this.handleInvite(from, username, signal);

      case 'CallAccept': {
        this.apply({ type: 'peer-accepted', cid: from, media: signal.media });
        // Opened on accept, not on invite: a session opened when we dialled
        // would hold a UDP channel for a call that may never be answered.
        await this.openSessionFor(from);
        return;
      }

      case 'CallDecline':
        this.apply({ type: 'peer-declined', cid: from, reason: signal.reason });
        await this.closeIfFinished();
        return;

      case 'CallEnd':
        this.apply({ type: 'peer-left', cid: from });
        await this.closeSessionFor(from);
        await this.closeIfFinished();
        return;

      case 'CallMediaState':
        this.apply({ type: 'peer-media-changed', cid: from, media: signal.media });
        return;

      case 'CallKeyframeRequest':
        // Surfaced through state so the encoder owner can act; the manager does
        // not hold encoders itself.
        this.keyframeRequests.push({ cid: from, track: signal.track });
        return;

      default:
        return;
    }
  }

  /** Keyframe requests received since the last drain. */
  private keyframeRequests: Array<{ cid: bigint; track: number }> = [];

  drainKeyframeRequests(): Array<{ cid: bigint; track: number }> {
    const requests = this.keyframeRequests;
    this.keyframeRequests = [];
    return requests;
  }

  private async handleInvite(
    from: bigint,
    username: string,
    signal: Extract<CallSignalPayload, { kind: 'CallInvite' }>,
  ): Promise<void> {
    if (signal.media_wire_version !== MEDIA_WIRE_VERSION) {
      // Declining is the honest answer. Accepting would mean decoding a frame
      // format we do not know, which looks like a broken camera to both sides.
      await this.options.transport.sendSignal(from, {
        kind: 'CallDecline',
        call_id: signal.call_id,
        reason: 'unsupported',
      });
      return;
    }

    // Glare: both sides dialled at once. Both compute the same winner locally,
    // so exactly one call survives without another round trip.
    if (this.state && this.state.status === 'ringing-out') {
      if (glareWinner(this.state.callId, signal.call_id) === 'ours') {
        await this.options.transport.sendSignal(from, {
          kind: 'CallDecline',
          call_id: signal.call_id,
          reason: 'busy',
        });
        return;
      }
      // They win: abandon ours and take theirs.
      this.apply({ type: 'ended', reason: 'hangup' });
    } else if (this.state && this.state.status !== 'ended' && this.state.status !== 'failed') {
      await this.options.transport.sendSignal(from, {
        kind: 'CallDecline',
        call_id: signal.call_id,
        reason: 'busy',
      });
      return;
    }

    this.apply({
      type: 'invite-received',
      callId: signal.call_id,
      roomId: signal.group?.room_id ?? null,
      from: { cid: from, username },
      media: signal.media,
    });
  }

  /** Answer the ringing call. */
  async accept(media: CallMediaKinds): Promise<void> {
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
        }),
      ),
    );
    // Opened after the accept is on the wire, so the peer is already expecting
    // frames by the time the session exists.
    await Promise.all(peers.map((cid) => this.openSessionFor(cid)));
  }

  async decline(reason: CallDeclineReason): Promise<void> {
    const state = this.state;
    if (!state) return;

    const peers = [...state.participants.keys()];
    this.apply({ type: 'declined-locally', reason });
    await Promise.all(
      peers.map((cid) =>
        this.options.transport
          .sendSignal(cid, { kind: 'CallDecline', call_id: state.callId, reason })
          .catch(() => undefined),
      ),
    );
  }

  /** Leave or cancel the call, telling everyone and releasing every session. */
  async end(reason: CallEndReason): Promise<void> {
    const state = this.state;
    if (!state) return;

    const peers = [...state.participants.keys()];
    await Promise.all(
      peers.map((cid) =>
        this.options.transport
          .sendSignal(cid, { kind: 'CallEnd', call_id: state.callId, reason })
          .catch(() => undefined),
      ),
    );
    await this.closeAllSessions();
    this.apply({ type: 'ended', reason });
  }

  /** Tell peers the microphone or camera changed, so their tiles stay honest. */
  async setSelfMedia(media: CallMediaKinds): Promise<void> {
    const state = this.state;
    if (!state) return;

    this.apply({ type: 'self-media-changed', media });
    await Promise.all(
      [...state.participants.keys()].map((cid) =>
        this.options.transport
          .sendSignal(cid, { kind: 'CallMediaState', call_id: state.callId, media })
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

  private async openSessionFor(cid: bigint): Promise<void> {
    if (this.openSessions.has(cid)) return;
    try {
      await this.options.transport.openSession(cid);
      this.openSessions.add(cid);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'could not open the media session';

      // Order matters. Marking the only participant as left first makes the
      // reducer end the call as an ordinary hangup, and 'failed' is then
      // correctly refused as a late transition over a terminal state — so the
      // user is told "call ended" instead of "this peer connected without UDP",
      // losing the one sentence that explains what to do.
      if (this.state && this.state.participants.size === 1) {
        this.apply({ type: 'failed', reason });
        return;
      }

      // In a group, one peer's media failing is that peer dropping out, not the
      // call failing — everyone else carries on.
      this.apply({ type: 'peer-left', cid });
    }
  }

  private async closeSessionFor(cid: bigint): Promise<void> {
    if (!this.openSessions.delete(cid)) return;
    await this.options.transport.closeSession(cid).catch(() => undefined);
  }

  private async closeAllSessions(): Promise<void> {
    const peers = [...this.openSessions];
    this.openSessions.clear();
    await Promise.all(peers.map((cid) => this.options.transport.closeSession(cid).catch(() => undefined)));
  }

  /** Release everything once the call has reached a terminal state. */
  private async closeIfFinished(): Promise<void> {
    if (!this.state) return;
    if (this.state.status === 'ended' || this.state.status === 'failed') {
      await this.closeAllSessions();
    }
  }
}
