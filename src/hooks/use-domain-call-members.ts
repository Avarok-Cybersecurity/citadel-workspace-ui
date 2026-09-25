import { useEffect, useState } from 'react';
import { isForDomain } from '@/lib/workspace-events/is-for-domain';
import WorkspaceService from '@/lib/workspace-service';
import { workspaceEvents, type MembersPayload } from '@/lib/workspace-events';
import { p2pRegistrationService } from '@/lib/p2p-registration-service';
import type { PeerInfoResponse } from '@/lib/p2p-registration-service/types';
import { getCurrentCid } from '@/lib/p2p/current-cid';
import { callableMembers, type RoomCallRoster } from '@/lib/call/callable-members';
import type { User } from '@/types/workspace-entities';
import { runAsyncSetup } from '@/lib/utils/async-utils';

/**
 * The callable roster of a workspace domain (office/room): every member except
 * the current user, in the {cid, username} shape startCall wants.
 *
 * Mirrors MembersSection: request ListMembers for our domain, and take only the
 * answer that names it. The comment here used to say the event carried no
 * domain id and that adopting any list was "the established contract" — that
 * was true when it was written and stopped being true when the filter landed.
 * `is-for-domain.ts` names the group-call roster as one of the four subscribers
 * it was written for, and this was the one that never got it: another entity's
 * ListMembers response replaced the callable roster, so Start call rang THAT
 * domain's members and dropped this one's.
 *
 * Members whose id is not a parseable CID are dropped; a call cannot ring an
 * identity the transport cannot address.
 */
const EMPTY: RoomCallRoster = { callable: [], notConnected: [] };

export function useDomainCallMembers(domainId: string | undefined): RoomCallRoster {
  const [members, setMembers] = useState<RoomCallRoster>(EMPTY);

  useEffect(() => {
    if (!domainId) {
      setMembers(EMPTY);
      return;
    }

    let cancelled: boolean = false;
    const unsubscribe: () => void = workspaceEvents.onMemberEvent(
      'members:loaded',
      (payload: MembersPayload) => {
        if (!isForDomain(payload.domainId, domainId)) return;

        // Member ids are usernames; the CIDs come from the peer directory. See callable-members.
        const roster: User[] = payload.members;
        runAsyncSetup(async () => {
          const [directory, registered, selfCid] = await Promise.all([
            p2pRegistrationService.listAllPeers(), p2pRegistrationService.listRegisteredPeers(), getCurrentCid(),
          ]);
          if (cancelled) return;
          setMembers(callableMembers(
            roster.map((user: User) => ({ id: user.id, username: user.username, displayName: user.displayName })),
            directory.map((peer: PeerInfoResponse) => ({ cid: peer.cid, username: peer.username ?? peer.peer_username })),
            selfCid ?? undefined,
            new Set(registered.flatMap((peer: PeerInfoResponse): bigint[] => (peer.cid === undefined ? [] : [peer.cid]))),
          ));
        });
      },
    );

    runAsyncSetup(async () => {
      await WorkspaceService.listMembers(domainId);
    });

    return (): void => {
      cancelled = true;
      unsubscribe();
    };
  }, [domainId]);

  return members;
}
