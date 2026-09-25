/**
 * The signed-in person's username and display name, for this tab.
 *
 * One hook so the top bar, the workspace switcher and the chat cannot disagree:
 * the tab's identity says WHO (see lib/tab-identity.ts) and the roster says what
 * they are called (see lib/roster-display-name.ts).
 */
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useTabIdentity } from '@/hooks/use-tab-identity';
import { selfDisplayName } from '@/lib/roster-display-name';
import type { TabIdentity } from '@/lib/tab-identity';

export interface SelfName {
  username: string | undefined;
  name: string | undefined;
}

export function useSelfName(): SelfName {
  const { state } = useWorkspace();
  const me: TabIdentity | null = useTabIdentity();
  const username: string | undefined = state.currentUser?.username || me?.username;
  const name: string | undefined = state.currentUser?.name
    || selfDisplayName(state.members, { username, fullName: me?.fullName });
  return { username, name };
}
