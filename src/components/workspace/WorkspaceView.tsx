import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BaseOffice } from '../office/BaseOffice';
import { P2PChat } from '../p2p/P2PChat';
import { getDefaultNodeContent, getDefaultChildNodeContent, getDefaultMDXShowcase } from '@/lib/default-mdx-content';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { isVariant } from 'citadel-workspace-client-ts';
import { connectionManager } from '@/lib/connection';
import { StoredSession } from '@/types/session-types';
import { getSelectedUser, TabUserContext } from '@/lib/tab-context';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { tryParseCid } from '@/lib/utils/cid-utils';

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
    const loadTabInfo = async () => {
      const selection = await getSelectedUser();
      const session = await connectionManager.getTabSelectedSession();
      setTabSelection(selection);
      setTabSession(session);
    };
    runAsyncSetup(loadTabInfo);
  }, []);
  
  // Parse query parameters for P2P chat
  const params = new URLSearchParams(location.search);
  const showP2P = params.get('showP2P') === 'true';
  const peerCid = params.get('channel');
  const peerName = params.get('p2pUser');

  // Get entity data from unified node hierarchy
  const node = nodeId ? state.nodes[nodeId] : null;

  // Determine whether this node has children (e.g., Office) or is a leaf (e.g., Room)
  const isLeafNode = node && isVariant(node.entity_type as Record<string, unknown>, 'Child')
    && (!node.allowed_child_types || node.allowed_child_types.length === 0);

  // Determine content to display
  const getInitialContent = () => {
    if (node && isLeafNode) {
      return getDefaultChildNodeContent(node.name, node.description);
    }
    if (node) {
      return getDefaultNodeContent(node.name);
    }
    return getDefaultMDXShowcase();
  };

  // Determine entity details
  const entityTitle = node?.name || "Welcome to Your Workspace";

  // When P2P chat is active, show the chat view
  if (showP2P && peerCid) {
    // Priority chain for currentUserCid:
    // 1) Tab context selectedCid (most authoritative for follower tabs)
    // 2) tabSession.cid from connection manager
    // 3) connectionInfo.cid (global connection)
    // tabSelection and tabSession are loaded asynchronously via useEffect
    const connectionInfo = connectionManager.getConnectionInfo();
    const rawCid = tabSelection?.selectedCid ?? tabSession?.cid ?? connectionInfo?.cid;
    const currentUserCid = rawCid !== undefined ? String(rawCid) : undefined;
    const currentUserName = tabSession?.fullName || connectionInfo?.fullName || 'You';

    // Both `BigInt(...)` calls below are funnelled through
    // `tryParseCid` so the parsing contract (and its boundary cases:
    // empty string, malformed input, fractional / scientific
    // notation) is exercised by `cid-utils.test.ts#tryParseCid`
    // rather than baked into this render path. peerCid coming from
    // `params.get('channel')` is the historical crash surface;
    // currentUserCid is defensive against corrupted IndexedDB state.
    const parsedPeerCid = tryParseCid(peerCid);
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
    const parsedCurrentUserCid = tryParseCid(currentUserCid);

    return (
      <div className="h-full bg-[#1C1D28]">
        <P2PChat
          peerCid={parsedPeerCid}
          peerName={peerName || undefined}
          currentUserCid={parsedCurrentUserCid}
          currentUserName={currentUserName}
        />
      </div>
    );
  }

  // Otherwise show the normal workspace content
  return (
    <BaseOffice
      title={entityTitle}
      getInitialContent={getInitialContent}
      nodeId={nodeId || undefined}
    />
  );
};