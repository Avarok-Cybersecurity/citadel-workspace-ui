import { useEffect, useState } from 'react';
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
 * Mirrors MembersSection: request ListMembers for our domain and adopt whatever
 * `members:loaded` answers — the event carries no domain id, so this is the
 * established contract, not an oversight of this hook. Members whose id is not
 * a parseable CID are dropped; a call cannot ring an identity the transport
 * cannot address.
 */
export function useDomainCallMembers(domainId: string | undefined): GroupCallMember[] {
  const [members, setMembers] = useState<GroupCallMember[]>([]);

  useEffect(() => {
    if (!domainId) {
      setMembers([]);
      return;
    }

    const unsubscribe = workspaceEvents.onMemberEvent(
      'members:loaded',
      (payload: MembersPayload) => {
        const selfCid = connectionManager.getConnectionInfo()?.cid ?? undefined;
        const callable: GroupCallMember[] = [];
        for (const user of payload.members) {
          const cid = tryParseCid(user.id);
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
