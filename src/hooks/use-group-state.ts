/**
 * Group Conversations State — the React face of the shared group store.
 *
 * State and event handling live in lib/group-conversations/group-store, ONCE
 * for the whole app. This hook only subscribes. It used to own both, per
 * instance: the sidebar's copy had the groups, the group page's fresh copy had
 * none, and opening a group you were just invited to bounced you straight back
 * to the workspace with "Group not found". See the store header for why the
 * localStorage bridge between those copies never actually persisted anything.
 */

import { useState, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react';
import type { GroupConversation } from '@/types/group';
import {
  getGroups,
  subscribeToGroups,
  updateGroups,
  startGroupEventBindings,
} from '@/lib/group-conversations/group-store';

export interface GroupState {
  groups: GroupConversation[];
  setGroups: React.Dispatch<React.SetStateAction<GroupConversation[]>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Subscribes this component to the shared group list. `loading` and `error`
 * remain per-consumer: they describe a consumer's own refresh, not the list.
 */
export function useGroupState(): GroupState {
  const groups = useSyncExternalStore(subscribeToGroups, getGroups);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Idempotent: the first consumer to mount arms the store's event
    // subscriptions; everyone after is a no-op.
    startGroupEventBindings();
  }, []);

  const setGroups = useCallback<React.Dispatch<React.SetStateAction<GroupConversation[]>>>(
    (action) => {
      updateGroups((prev) =>
        typeof action === 'function'
          ? (action as (p: GroupConversation[]) => GroupConversation[])(prev)
          : action,
      );
    },
    [],
  );

  return { groups, setGroups, loading, setLoading, error, setError };
}

/**
 * Sorts groups by last message time (most recent first).
 */
export function useSortedGroups(groups: GroupConversation[]): GroupConversation[] {
  return useMemo(() => {
    return [...groups].sort((a, b) => {
      const aTime = a.lastMessageTime || 0;
      const bTime = b.lastMessageTime || 0;
      return bTime - aTime;
    });
  }, [groups]);
}
