/**
 * The reaction binding for one peer-group message: its chips, who each reactor
 * is, and what pressing an emoji does.
 *
 * Reactors are named from the group's own member list, the way the member
 * avatars are, through peerDisplayName so a reactor reads the same here as in
 * the sidebar. A cid the list does not hold still gets a stable handle.
 */
import { toast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debug-config';
import { failureDescription } from '@/lib/p2p/peer-failure-detail';
import { peerDisplayName } from '@/lib/peer-display';
import { instanceManager } from '@/lib/multi-instance/instance-manager';
import { reactionChips } from '@/lib/reactions/reaction-state';
import { getGroups } from '@/lib/group-conversations/group-store';
import { reactInGroup } from '@/lib/group-conversations/group-reactions';
import type { GroupConversation } from '@/types/group';
import type { GroupMessage } from '@/types/workspace-entities';
import type { ReactionBinding } from './shared/reactions/reaction-binding';

function reactorName(groupId: string, self: bigint | null): (cid: bigint) => string {
  return (cid: bigint): string => {
    if (cid === self) return 'You';
    const group: GroupConversation | undefined = getGroups().find((g) => g.id === groupId);
    return peerDisplayName({ cid, username: group?.members.find((m) => m.cid === cid)?.username });
  };
}

function react(groupId: string, messageId: string, emoji: string): void {
  reactInGroup(groupId, messageId, emoji).catch((error: unknown): void => {
    debugLog('GroupChatView', 'Failed to react to message:', error);
    toast({
      title: 'Could not update reaction',
      description: failureDescription(error, 'The other members were not told. Try again when you are connected.'),
      variant: 'destructive',
    });
  });
}

export function groupReactionBinding(groupId: string, message: GroupMessage): ReactionBinding {
  const self: bigint | null = instanceManager.cid;
  return {
    chips: reactionChips(message.reactions, self),
    nameFor: reactorName(groupId, self),
    onReact: (emoji: string): void => react(groupId, message.id, emoji),
  };
}
