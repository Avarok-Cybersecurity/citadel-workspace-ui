/**
 * Turning the stored sessions into the switcher's list, and picking the active one.
 *
 * Extracted from useWorkspaceSwitcher because it is the whole decision and none
 * of the I/O: which sessions become rows, which row is "you are here", and the
 * precedence between the tab's own selection and the connection's CID. Testable
 * without a connection manager, an IndexedDB read or a React render.
 */

import type { StoredSession } from '@/types/session-types';

export interface StoredWorkspace {
  id: string;
  username: string;
  serverAddress: string;
  workspaceName?: string;
  isActive: boolean;
  cid?: bigint;
  fullName?: string;
  role?: string;
}


/** The tab's own selection, which outranks the connection's CID. */
export interface TabSelection {
  selectedUsername?: string;
  selectedServerAddress?: string;
}

export function toStoredWorkspaces(
  sessions: readonly StoredSession[],
  workspaceName: string | undefined,
  currentCid: bigint | null,
): StoredWorkspace[] {
  return sessions.map((session) => ({
    id: `${session.serverAddress}-${session.username}`,
    username: session.username,
    serverAddress: session.serverAddress,
    workspaceName: workspaceName || session.username,
    isActive: session.cid === currentCid,
    cid: session.cid,
    fullName: session.fullName,
    role: session.role || 'Member',
  }));
}

/**
 * The tab's selection wins over the connected CID.
 *
 * With several sessions on one WebSocket the connection's CID is whichever
 * session the shared client last touched — not necessarily this tab's. Reading
 * it first would swap the switcher's label out from under the user when another
 * tab connected.
 */
export function pickCurrentWorkspace(
  workspaces: readonly StoredWorkspace[],
  tabSelection: TabSelection | null | undefined,
): StoredWorkspace | undefined {
  const selected = tabSelection?.selectedUsername
    ? workspaces.find(
        (w) =>
          w.username === tabSelection.selectedUsername &&
          w.serverAddress === tabSelection.selectedServerAddress,
      )
    : undefined;
  return selected ?? workspaces.find((w) => w.isActive);
}
