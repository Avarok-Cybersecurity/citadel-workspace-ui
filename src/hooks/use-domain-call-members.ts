import { useEffect, useState } from 'react';
import { isForDomain } from '@/lib/workspace-events/is-for-domain';
import WorkspaceService from '@/lib/workspace-service';
import { workspaceEvents, type MembersPayload } from '@/lib/workspace-events';
import { connectionManager } from '@/lib/connection';
import { tryParseCid } from '@/lib/utils/cid-utils';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import type { GroupCallMember } from '@/components/call/GroupCallControls';

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
export function useDomainCallMembers(domainId: string | undefined): GroupCallMember[] {
  const [members, setMembers] = useState<GroupCallMember[]>([]);

  useEffect(() => {
    if (!domainId) {
      setMembers([]);
      return;
    }

    const unsubscribe: () => void = workspaceEvents.onMemberEvent(
      'members:loaded',
      (payload: MembersPayload) => {
        if (!isForDomain(payload.domainId, domainId)) return;

        const selfCid: bigint | undefined = connectionManager.getConnectionInfo()?.cid ?? undefined;
        const callable: GroupCallMember[] = [];
        for (const user of payload.members) {
          const cid: bigint | undefined = tryParseCid(user.id);
          if (cid === undefined || cid === selfCid) continue;
          callable.push({ cid, username: user.username || user.displayName || user.id });
        }
        setMembers(callable);
      },
    );

    runAsyncSetup(async () => {
      await WorkspaceService.listMembers(domainId);
    });

    return unsubscribe;
  }, [domainId]);

  return members;
}
