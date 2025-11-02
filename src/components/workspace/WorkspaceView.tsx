import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BaseOffice } from '../office/BaseOffice';
import { P2PChat } from '../p2p/P2PChat';
import { getDefaultOfficeContent, getDefaultRoomContent, getDefaultMDXShowcase } from '@/lib/default-mdx-content';
import { useWorkspace } from '@/lib/workspace-context';

interface WorkspaceViewProps {
  officeId?: string | null;
  roomId?: string | null;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ officeId, roomId }) => {
  const { state } = useWorkspace();
  const location = useLocation();
  
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
    return (
      <div className="h-full bg-[#1C1D28]">
        <P2PChat peerCid={peerCid} peerName={peerName || undefined} />
      </div>
    );
  }

  // Otherwise show the normal workspace content
  return (
    <BaseOffice 
      title={entityTitle} 
      getInitialContent={getInitialContent}
      officeId={entityType === "office" ? officeId : undefined}
      roomId={entityType === "room" ? roomId : undefined}
    />
  );
};