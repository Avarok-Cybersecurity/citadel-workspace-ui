/**
 * Inbound call-control signals: invite, accept, decline, end, media state,
 * keyframe requests.
 *
 * Extracted from CallManager verbatim. The guards at the top of each function
 * are the load-bearing part — they are what keep retransmitted and stale
 * signals from poisoning a live call.
 */

import type { CallSignalPayload } from '@/types/p2p-commands';
import { glareWinner } from './call-state';
import { MEDIA_WIRE_VERSION } from './call-constants';
import type { CallManagerInternals } from './call-manager-internals';
import { closeIfFinished, closeSessionFor, openSessionFor } from './media-session-lifecycle';

export async function handleInboundSignal(
  m: CallManagerInternals,
  from: bigint,
  username: string,
  signal: CallSignalPayload,
): Promise<void> {
  if (signal.kind === 'CallInvite') {
    return handleInvite(m, from, username, signal);
  }

  // Every other signal must belong to the call we are in. This is not
  // defensive paranoia: after glare, the loser's `busy` decline of the
  // ABANDONED call otherwise lands on the surviving call and ends it — and
  // the reliable messaging layer can deliver a signal twice, so a stale
  // call_id is an ordinary event, not a corrupt peer.
  const state = m.getState();
  if (!state || signal.call_id !== state.callId) return;

  switch (signal.kind) {
    case 'CallAccept': {
      m.codecs.recordCaps(from, signal.codecs);
      m.codecs.recordSendCodec(from, signal.video_send_codec);
      m.apply({ type: 'peer-accepted', cid: from, media: signal.media });
      // Opened on accept, not on invite: a session opened when we dialled
      // would hold a UDP channel for a call that may never be answered.
      await openSessionFor(m, from);
      return;
    }

    case 'CallDecline':
      m.apply({ type: 'peer-declined', cid: from, reason: signal.reason });
      await closeIfFinished(m);
      return;

    case 'CallEnd':
      m.apply({ type: 'peer-left', cid: from });
      await closeSessionFor(m, from);
      await closeIfFinished(m);
      return;

    case 'CallMediaState':
      m.codecs.recordSendCodec(from, signal.video_send_codec);
      m.apply({ type: 'peer-media-changed', cid: from, media: signal.media });
      return;

    case 'CallKeyframeRequest':
      // Straight through to the encoder owner. Buffering these was both a
      // dead end (nothing drained the buffer) and unbounded growth at the
      // far side's request rate.
      m.keyframeRequested(signal.track);
      return;

    default:
      return;
  }
}

async function handleInvite(
  m: CallManagerInternals,
  from: bigint,
  username: string,
  signal: Extract<CallSignalPayload, { kind: 'CallInvite' }>,
): Promise<void> {
  // A second copy of the invite for the call we already have is a retransmit
  // — the reliable layer delivers duplicates. Falling through would hit the
  // busy branch below and decline OUR OWN call, killing it on both sides.
  const current = m.getState();
  if (current && current.callId === signal.call_id) return;

  if (signal.media_wire_version !== MEDIA_WIRE_VERSION) {
    // Declining is the honest answer. Accepting would mean decoding a frame
    // format we do not know, which looks like a broken camera to both sides.
    await m.transport.sendSignal(from, {
      kind: 'CallDecline',
      call_id: signal.call_id,
      reason: 'unsupported',
    });
    return;
  }

  // Glare: both sides dialled at once. Both compute the same winner locally,
  // so exactly one call survives without another round trip.
  if (current && current.status === 'ringing-out') {
    if (glareWinner(current.callId, signal.call_id) === 'ours') {
      await m.transport.sendSignal(from, {
        kind: 'CallDecline',
        call_id: signal.call_id,
        reason: 'busy',
      });
      return;
    }
    // They win: abandon ours and take theirs.
    m.apply({ type: 'ended', reason: 'hangup' });
  } else if (current && current.status !== 'ended' && current.status !== 'failed') {
    await m.transport.sendSignal(from, {
      kind: 'CallDecline',
      call_id: signal.call_id,
      reason: 'busy',
    });
    return;
  }

  // Adopting the call: remember what the caller can decode and what they
  // said they will send, so both directions of video can be negotiated.
  m.codecs.clear();
  m.codecs.recordCaps(from, signal.codecs);
  m.codecs.recordSendCodec(from, signal.video_send_codec);

  m.apply({
    type: 'invite-received',
    callId: signal.call_id,
    roomId: signal.group?.room_id ?? null,
    from: { cid: from, username },
    media: signal.media,
  });
}
