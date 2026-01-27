import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BaseOffice } from '../office/BaseOffice';
import { P2PChat } from '../p2p/P2PChat';
import { getDefaultOfficeContent, getDefaultRoomContent, getDefaultMDXShowcase } from '@/lib/default-mdx-content';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { connectionManager } from '@/lib/connection';
import { StoredSession } from '@/types/session-types';
import { getSelectedUser, TabUserContext } from '@/lib/tab-context';

interface WorkspaceViewProps {
  officeId?: string | null;
  roomId?: string | null;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ officeId, roomId }) => {
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
    (async () => {
      await loadTabInfo();
    })().catch(console.error);
  }, []);
  
  // Parse query parameters for P2P chat
  const params = new URLSearchParams(location.search);
  const showP2P = params.get('showP2P') === 'true';
  const peerCid = params.get('channel');
  const peerName = params.get('p2pUser');

  // Get office and room data
  const office = officeId ? state.offices[officeId] : null;
  const room = roomId ? state.rooms[roomId] : null;

  // Determine content to display
  const getInitialContent = () => {
    if (room) {
      return getDefaultRoomContent(room.name, room.description);
    }
    if (office) {
      return getDefaultOfficeContent(office.name);
    }
    return getDefaultMDXShowcase();
  };

  // Determine entity details
  const entityTitle = room ? room.name : (office?.name || "Welcome to Your Workspace");
  const entityType = room ? "room" : "office";

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

    return (
      <div className="h-full bg-[#1C1D28]">
        <P2PChat
          peerCid={BigInt(peerCid)}
          peerName={peerName || undefined}
          currentUserCid={currentUserCid ? BigInt(currentUserCid) : undefined}
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
      officeId={entityType === "office" && officeId ? officeId : undefined}
      roomId={entityType === "room" && roomId ? roomId : undefined}
    />
  );
};