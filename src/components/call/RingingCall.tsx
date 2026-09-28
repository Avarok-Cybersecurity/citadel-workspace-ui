import { useSyncExternalStore } from 'react';
import { IncomingCallCard } from './IncomingCallCard';
import { useCall } from '@/lib/call/call-context';
import { useIsLeaderTab } from './use-leader-tab';
import { useRosterName } from './use-roster-name';
import type { CallParticipant } from '@/lib/call/call-state';
import { getChannelNames, roomNameFor, subscribeToChannelNames } from '@/lib/call/room-names';
import { getGroups, subscribeToGroups } from '@/lib/group-conversations/group-store';
import type { GroupConversation } from '@/types/group';

/**
 * The ringing card, rendered wherever the user is.
 *
 * Separate from CallLayer so it can consume the context CallLayer provides —
 * a component cannot read a provider it is itself rendering.
 */
export function RingingCall(): JSX.Element | null {
  const { call, accept, decline } = useCall();
  // Exactly one tab rings, and it is the one that can actually answer. A
  // follower has no WebSocket client, so accepting there opened no media
  // session and the caller heard nothing -- while the leader tab, which could
  // have taken the call, rang alongside it.
  const isLeaderTab: boolean = useIsLeaderTab();
  const caller: CallParticipant | undefined = call ? [...call.participants.values()][0] : undefined;
  // Named as the sidebar names them, not as the signal froze them. See use-roster-name.
  const callerName: string = useRosterName(caller?.cid ?? null, caller?.username ?? '');
  const channels: ReadonlyMap<string, string> = useSyncExternalStore(subscribeToChannelNames, getChannelNames);
  const groups: GroupConversation[] = useSyncExternalStore(subscribeToGroups, getGroups);

  if (!isLeaderTab) return null;
  if (!call || call.status !== 'ringing-in') return null;
  if (!caller) return null;

  return (
    <IncomingCallCard
      callerName={callerName}
      media={caller.media}
      roomName={call.roomId ? roomNameFor(call.roomId, channels, groups) : null}
      onAccept={(media) => void accept(media)}
      onDecline={() => void decline()}
    />
  );
}
