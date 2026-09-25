/**
 * Applying a peer's reaction change to our transcript.
 *
 * The inbound half of messenger-reaction.ts, shaped like inbound-revision.ts:
 * the reactor is `peerCid`, the transport's word for who sent this, never a
 * field of the body. A redelivery folds to "no-change" and is neither written
 * nor re-emitted.
 */
import { eventEmitter } from '../event-emitter';
import { debugLog, errorLog } from '@/lib/debug-config';
import { readReactionLayer, type MessageReactionLayer } from '@/types/message-reaction-layer';
import { applyReaction, type ReactionOutcome } from './message-reaction';
import type { P2PConversation } from './p2p-types';
import type { MessageHandlerConfig } from './message-handler-types';

export async function applyIncomingReaction(
  config: MessageHandlerConfig,
  peerCid: bigint,
  layer: MessageReactionLayer,
): Promise<void> {
  // The layer came off the wire; its declared type is a claim, not a check.
  const fields: Omit<MessageReactionLayer, 'type'> | null = readReactionLayer(layer as unknown as Record<string, unknown>);
  if (!fields) {
    debugLog('P2PMessageHandler', 'Ignored a malformed reaction from', peerCid.toString());
    return;
  }
  const conversation: P2PConversation = config.getOrCreateConversation(peerCid);
  const outcome: ReactionOutcome = applyReaction(conversation, fields.message_id, {
    emoji: fields.emoji, reactorCid: peerCid, at: fields.reacted_at, active: fields.active,
  });
  if (!outcome.applied) {
    debugLog('P2PMessageHandler', `Ignored reaction on ${fields.message_id}: ${outcome.reason}`);
    return;
  }
  if (!(await config.updateMessageInPages(peerCid, fields.message_id, { reactions: outcome.message.reactions }))) {
    errorLog('P2PMessageHandler',
      `Reaction on ${fields.message_id} from ${peerCid} was not written to the stored transcript; ` +
      'a reload will not show it.');
  }
  eventEmitter.emit('p2p:message-updated', outcome.message);
}
