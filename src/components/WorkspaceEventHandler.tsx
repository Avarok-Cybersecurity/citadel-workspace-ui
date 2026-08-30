import { isPlaceholderName } from '@/lib/peer-display';
import React, { useEffect, useState } from 'react';
import { sessionGet, sessionRemove, sessionSet } from '@/lib/safe-session-storage';
import { WorkspaceProvider, WorkspaceState } from '@/contexts/WorkspaceContext';
import WorkspaceService from '../lib/workspace-service';
import { WorkspaceInitializationModal } from './WorkspaceInitializationModal';
import { connectionManager } from '../lib/connection';

import {
  useWorkspaceEventSetup,
  useMemberEventSetup,
  useEventEmitterSetup,
  useNodeEventSetup,
  useMessageEventSetup,
} from './hooks';
import { debugLog } from '@/lib/debug-config';
import { WorkspaceThemeProvider } from './theme/WorkspaceThemeProvider';

/**
 * The event handler's state: the context's `WorkspaceState`, plus the one field
 * only this component sets.
 *
 * `extends`, not a parallel copy passed through `state as WorkspaceState`. The
 * two had drifted into near-identical lists bridged by a cast, so a field added
 * to this one was invisible to consumers reading the other -- which is how
 * `nodesUnavailable` compiled here and failed at the sidebar that needed it.
 *
 * Making it extend required the writer to stop storing decoded JSON in
 * `workspace.metadata`, which is declared as the raw bytes it arrives as. That
 * mismatch had been true for as long as the cast had.
 */
export interface WorkspaceEventState extends WorkspaceState {
  needsWorkspaceInitialization?: boolean;
}


/**
 * Component that handles workspace events and provides a central place
 * for managing workspace state updates.
 */
export const WorkspaceEventHandler: React.FC<{
  onStateChange?: (state: WorkspaceEventState) => void;
  children?: React.ReactNode;
}> = ({ onStateChange, children }) => {
  const [state, setState] = useState<WorkspaceEventState>({
    workspace: undefined,
    nodes: {},
    treeSchema: null,
    members: {},
    loading: { workspace: false, members: false, nodes: false },
    nodesUnavailable: false,
    needsWorkspaceInitialization: false,
    messages: {
      byPeer: {} as Record<string, Array<{
        content: string; timestamp: number; id?: string; pending?: boolean;
      }>>,
      lastMessageTimestamp: Date.now(),
    },
    typing: { peerIds: [], lastUpdated: Date.now() }
  });

  const [showInitModal, setShowInitModal] = useState(false);
  const [initModalDismissed, setInitModalDismissed] = useState(() => {
    return sessionGet('workspace-init-modal-dismissed') === 'true';
  });

  useEffect(() => {
    if (state.needsWorkspaceInitialization && !showInitModal && !initModalDismissed) {
      debugLog('WorkspaceEventHandler', 'Workspace needs initialization - showing modal');
      setShowInitModal(true);
    }
  }, [state.needsWorkspaceInitialization, showInitModal, initModalDismissed]);

  // Use extracted hooks for event setup
  useWorkspaceEventSetup({ setState });
  useMemberEventSetup({ setState });
  useNodeEventSetup({ setState });
  useEventEmitterSetup({ setState });
  useMessageEventSetup({ setState });

  // `state.messages.byPeer` is deliberately NOT persisted.
  //
  // Nothing renders it. Across the whole app there are nine references: two type
  // declarations, an empty initial value, this component's load/save pair, and
  // three in useMessageEventSetup's append path. Every surface that shows
  // messages — useP2PMessages, P2PPeerList, GroupChatView — reads
  // `conversation.messages` from the IndexedDB pagination store instead.
  //
  // Persisting it therefore bought nothing and cost three things: it rewrote the
  // ENTIRE per-peer map to localStorage on every received message, against a
  // ~5MB cap, after which every write throws QuotaExceededError and the app
  // carries on looking fine; it JSON.stringified data containing BigInt CIDs
  // through a replacer, which CLAUDE.md explicitly forbids ("browser storage:
  // IndexedDB", "NO JSON.stringify for data containing BigInt"); and it was a
  // second message cache shadowing the one the UI actually reads.
  //
  // The in-memory state stays, so the event path is untouched.

  useEffect(() => {
    if (onStateChange) onStateChange(state);
  }, [state, onStateChange]);

  const handleWorkspaceInitialized = (): void => {
    setShowInitModal(false);
    sessionRemove('workspace-init-modal-dismissed');
    setState(prev => ({ ...prev, needsWorkspaceInitialization: false, error: undefined }));
    WorkspaceService.loadWorkspace()
      .then(() => debugLog('WorkspaceEventHandler', 'Workspace reloaded after initialization'))
      .catch(error => debugLog('WorkspaceEventHandler', 'Error reloading workspace after initialization:', error));
  };

  /**
   * Cancelling initialisation means declining to set this workspace up, so it
   * returns to the index rather than leaving the user inside a workspace that
   * does not exist yet — which showed an empty, non-functional shell with no
   * way back and no explanation.
   *
   * A location assignment, NOT useNavigate: this component is mounted ABOVE
   * BrowserRouter (App.tsx renders WorkspaceApp outside it), so the router hooks
   * throw here and take the whole app down with them — tsc cannot see that, and
   * the first symptom is a blank page. A full load is also the right semantics
   * for declining setup, since it drops the half-built workspace context.
   */
  const handleInitCancelled = (): void => {
    setShowInitModal(false);
    setInitModalDismissed(true);
    sessionSet('workspace-init-modal-dismissed', 'true');
    // Deliberately no navigation.
    //
    // This used to `window.location.assign('/')`, throwing the user out of the
    // workspace they had just successfully joined. Initialization needs the
    // operator's WORKSPACE_MASTER_PASSWORD, which no ordinary member has — and
    // this modal is shown to EVERY user until somebody completes it — so the
    // only available action ejected them.
    //
    // The dismissal is already recorded above and the workspace is already
    // usable: the root workspace is seeded at boot and Admin is granted at
    // connect to the first member, so nothing here gates access.
  };

  return (
    <>
      <WorkspaceProvider state={state}>
        {/* Inside WorkspaceProvider: the theme lives in the workspace's metadata,
            so it can only be read once the workspace is in context. */}
        <WorkspaceThemeProvider>{children}</WorkspaceThemeProvider>
      </WorkspaceProvider>
      <WorkspaceInitializationModal
        isOpen={showInitModal}
        onClose={handleInitCancelled}
        onSuccess={handleWorkspaceInitialized}
        workspaceName={state.workspace?.name}
        workspaceId={state.workspace?.id || 'root'}
        serverAddress={connectionManager.getStoredSessionsArray()[0]?.serverAddress}
        username={isPlaceholderName(state.currentUser?.username) ? connectionManager.getStoredSessionsArray()[0]?.username : state.currentUser?.username}
        fullName={isPlaceholderName(state.currentUser?.name) ? connectionManager.getStoredSessionsArray()[0]?.fullName : state.currentUser?.name}
      />
    </>
  );
};

export default WorkspaceEventHandler;
