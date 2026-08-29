import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { BaseOffice } from '../office/BaseOffice';
import { P2PChat } from '../p2p/P2PChat';
import { getDefaultNodeContent, getDefaultChildNodeContent, getDefaultMDXShowcase } from '@/lib/default-mdx-content';
import { NodeNotFound } from './NodeNotFound';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { isVariant } from 'citadel-workspace-client-ts';
import { connectionManager } from '@/lib/connection';
import { StoredSession } from '@/types/session-types';
import { getSelectedUser, TabUserContext } from '@/lib/tab-context';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { tryParseCid } from '@/lib/utils/cid-utils';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';
import type { CurrentConnectionInfo } from '@/lib/connection/types';
import type { DomainNode } from '@/components/layout/sidebar/tree-node-types';

interface WorkspaceViewProps {
  nodeId?: string | null;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ nodeId }) => {
  const { state } = useWorkspace();
  const location = useLocation();
  const [tabSelection, setTabSelection] = useState<TabUserContext | null>(null);
  const [tabSession, setTabSession] = useState<StoredSession | null>(null);

  // Load tab context and session asynchronously
  useEffect(() => {
    const loadTabInfo = async (): Promise<void> => {
      const selection: TabUserContext | null = await getSelectedUser();
      const session: StoredSession | null = await connectionManager.getTabSelectedSession();
      setTabSelection(selection);
      setTabSession(session);
    };
    runAsyncSetup(loadTabInfo);
  }, []);
  
  // Parse query parameters for P2P chat
  const params: URLSearchParams = new URLSearchParams(location.search);
  const showP2P: boolean = params.get('showP2P') === 'true';
  const peerCid: string | null = params.get('channel');
  const peerName: string | null = params.get('p2pUser');

  // Get entity data from unified node hierarchy
  const node: DomainNode | null = nodeId ? state.nodes[nodeId] : null;

  // Determine whether this node has children (e.g., Office) or is a leaf (e.g., Room)
  const isLeafNode: boolean | null = node && isVariant(node.entity_type as Record<string, unknown>, 'Child')
    && (!node.allowed_child_types || node.allowed_child_types.length === 0);

  // useCallback, not a bare arrow. A new identity every render put this in
  // BaseOffice's content effect dependencies and re-ran it on every unrelated
  // store change — which overwrote the editor buffer.
  const getInitialContent: () => string = useCallback((): string => {
    if (node && isLeafNode) {
      return getDefaultChildNodeContent(node.name, node.description);
    }
    if (node) {
      return getDefaultNodeContent(node.name);
    }
    return getDefaultMDXShowcase();
  }, [node, isLeafNode]);

  // Determine entity details
  const entityTitle: string = node?.name || "Welcome to Your Workspace";

  // When P2P chat is active, show the chat view
  if (showP2P && peerCid) {
    // Priority chain for currentUserCid:
    // 1) Tab context selectedCid (most authoritative for follower tabs)
    // 2) tabSession.cid from connection manager
    // 3) connectionInfo.cid (global connection)
    // tabSelection and tabSession are loaded asynchronously via useEffect
    const connectionInfo: CurrentConnectionInfo | null = connectionManager.getConnectionInfo();
    const rawCid: bigint | undefined = tabSelection?.selectedCid ?? tabSession?.cid ?? connectionInfo?.cid;
    const currentUserCid: string | undefined = rawCid !== undefined ? String(rawCid) : undefined;
    const currentUserName: string = tabSession?.fullName || connectionInfo?.fullName || 'You';

    // Both `BigInt(...)` calls below are funnelled through
    // `tryParseCid` so the parsing contract (and its boundary cases:
    // empty string, malformed input, fractional / scientific
    // notation) is exercised by `cid-utils.test.ts#tryParseCid`
    // rather than baked into this render path. peerCid coming from
    // `params.get('channel')` is the historical crash surface;
    // currentUserCid is defensive against corrupted IndexedDB state.
    const parsedPeerCid: bigint | undefined = tryParseCid(peerCid);
    if (parsedPeerCid === undefined) {
      // Invalid CID in URL — fall through to normal workspace view
      return (
        <BaseOffice
          title={entityTitle}
          getInitialContent={getInitialContent}
          nodeId={nodeId || undefined}
        />
      );
    }
    const parsedCurrentUserCid: bigint | undefined = tryParseCid(currentUserCid);

    return (
      <div className="h-full bg-background">
        {/* Keyed by peer — see the note in pages/Messages.tsx. */}
        <P2PChat
          key={parsedPeerCid.toString()}
          peerCid={parsedPeerCid}
          peerName={peerName || undefined}
          currentUserCid={parsedCurrentUserCid}
          currentUserName={currentUserName}
        />
      </div>
    );
  }

  // A URL naming a node we do not have is not the same as no URL at all. Both
  // used to fall through to `getDefaultMDXShowcase()` and render the editor
  // demo as though it were the document -- see NodeNotFound.
  //
  // Gated on the nodes having loaded: during the initial fetch `state.nodes` is
  // empty for every id, and announcing "no longer here" about a page that is
  // simply still arriving would be its own lie.
  if (nodeId && !node && !state.loading.nodes) {
    return <NodeNotFound nodeId={nodeId} />;
  }

  // Otherwise show the normal workspace content
  return (
    <BaseOffice
      // Keyed: without it React reuses the instance across nodes, so `isEditing`
      // stayed true while the buffer was swapped to the other node's body.
      key={nodeId ?? WORKSPACE_ROOT_ID}
      title={entityTitle}
      getInitialContent={getInitialContent}
      nodeId={nodeId || undefined}
    />
  );
};