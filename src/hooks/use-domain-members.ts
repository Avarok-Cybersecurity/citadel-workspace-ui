/**
 * The member list for one domain, and whether it is still loading.
 *
 * Extracted from MembersSection, which had grown past the repo's 250-line
 * limit. The three effects belong together — they are one conversation with the
 * server — so lifting them out is structure rather than line-shuffling.
 *
 * The subtlety they encode: `WorkspaceService.listMembers()` resolves when the
 * request has been SENT. The members arrive separately on a `members:loaded`
 * event. Clearing the loading flag in a `finally` on that send therefore ended
 * the load with the list still empty, and the sidebar rendered its empty state —
 * "No members yet. Use the + button to discover peers" — about a workspace that
 * had members and was merely fetching them. That was KNOWN_ISSUES #6.
 */
import { useEffect, useState } from 'react';
import { isForDomain } from '@/lib/workspace-events/is-for-domain';
import WorkspaceService from '@/lib/workspace-service';
import { workspaceEvents, type MembersPayload } from '@/lib/workspace-events';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import type { User as WorkspaceMember } from '@/types/workspace-entities';

/**
 * A reply that never comes must not leave the section spinning forever. Falling
 * back to the empty state after this long is a worse answer than the real list
 * and a better one than an indefinite "Loading members...".
 */
const MEMBER_LOAD_TIMEOUT_MS: number = 15_000;

export interface DomainMembers {
  members: WorkspaceMember[];
  setMembers: React.Dispatch<React.SetStateAction<WorkspaceMember[]>>;
  isLoadingMembers: boolean;
}

export function useDomainMembers(activeDomainId: string | null): DomainMembers {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  useEffect(() => {
    const loadMembers = async (): Promise<void> => {
      if (!activeDomainId) {
        setMembers([]);
        setIsLoadingMembers(false);
        return;
      }
      // Clear first: the previous node's members would otherwise stay on screen,
      // attributed to the node just opened.
      setMembers([]);
      setIsLoadingMembers(true);
      try {
        await WorkspaceService.listMembers(activeDomainId);
      } catch (error) {
        debugLog('useDomainMembers', 'Error loading members:', error);
        setIsLoadingMembers(false);
      }
      // Deliberately NOT cleared here — see the note at the top of this file.
    };
    runAsyncSetup(loadMembers);
  }, [activeDomainId]);

  useEffect(() => {
    const handleMembersLoaded = (payload: MembersPayload): void => {
      // See is-for-domain: a list fetched for another domain used to replace
      // this one, and this hook's members are the corpus the user search
      // searches.
      if (!isForDomain(payload.domainId, activeDomainId ?? undefined)) return;
      if (payload.members) setMembers(payload.members);
      // The response is what ends the load.
      setIsLoadingMembers(false);
    };
    // `onMemberEvent` returns its unsubscribe SYNCHRONOUSLY. It used to be
    // wrapped in `runAsyncSetup(async () => await ...)`, which threw the return
    // value away, so every remount left another live listener behind — and this
    // hook lives in AppLayout's MembersSection, which remounts on every route
    // change. Nothing broke visibly (setState on an unmounted component is a
    // no-op), which is exactly why it accumulated: each members:loaded event ran
    // an ever-growing pile of dead handlers, each retaining a dead closure.
    // `use-domain-call-members` subscribes to this same event and has always
    // returned its unsubscribe; the fix was simply never carried across.
    // MembersTab.tsx had the identical defect.
    return workspaceEvents.onMemberEvent('members:loaded', handleMembersLoaded);
  }, [activeDomainId]);

  useEffect(() => {
    if (!isLoadingMembers) return;
    const timer: number = window.setTimeout(() => setIsLoadingMembers(false), MEMBER_LOAD_TIMEOUT_MS);
    return (): void => window.clearTimeout(timer);
  }, [isLoadingMembers]);

  return { members, setMembers, isLoadingMembers };
}
