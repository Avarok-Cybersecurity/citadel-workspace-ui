/**
 * What a group can actually do to a message.
 *
 * The peer wire carries `GroupMessage` and nothing else — there is no
 * `GroupEdit` and no `GroupDelete`. `useGroupChat` routed both to the workspace
 * server, which refuses a group it does not own, so the Edit and Delete items
 * in a peer group's message menu were controls whose only possible outcome was
 * "Permission denied: not a member of this chat channel".
 *
 * Hiding them is the honest answer: an affordance that cannot succeed is worse
 * than no affordance, because the user reads the failure as their own mistake
 * or as the app being broken.
 *
 * Reply is different, and was worth keeping rather than hiding: the envelope is
 * ours, so `reply_to` now travels with a peer-group message instead of being
 * dropped — which is what pressing Reply used to do there.
 */
import { groupSendTransport } from './group-send-transport';

export interface GroupMessageActions {
  canReply: boolean;
  canRevise: boolean;
}

export function groupMessageActions(groupId: string): GroupMessageActions {
  const peer: boolean = groupSendTransport(groupId) === 'peer';
  return { canReply: true, canRevise: !peer };
}
