import React, { useState, useEffect } from 'react';
import { P2PChat } from '@/components/p2p/P2PChat';
import { P2PPeerList } from '@/components/p2p/P2PPeerList';
import { connectionManager } from '@/lib/connection-manager';
import { websocketService } from '@/lib/websocket-service';
import { getSelectedUser, setSelectedUser } from '@/lib/tab-context';
import WorkspaceService from '@/lib/workspace-service';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MessageCircle, AlertCircle, Loader2 } from 'lucide-react';

export function P2PMessaging() {
  const [selectedPeerCid, setSelectedPeerCid] = useState<string>();
  const [connectionInfo, setConnectionInfo] = useState<{ cid: string } | null>(null);
  const [isRecoveringConnection, setIsRecoveringConnection] = useState(false);

  useEffect(() => {
    const recoverConnection = async () => {
      // Check if we already have an active connection
      const existingInfo = connectionManager.getConnectionInfo();
      if (existingInfo?.cid) {
        console.log('P2PMessaging: Using existing connection:', existingInfo.cid);
        setConnectionInfo(existingInfo);
        return;
      }

      // Try to recover connection from stored sessions
      console.log('P2PMessaging: No active connection, attempting recovery...');
      setIsRecoveringConnection(true);

      try {
        // Wait for ConnectionManager to finish loading stored sessions
        console.log('P2PMessaging: Waiting for ConnectionManager to be ready...');
        await connectionManager.waitForReady();
        console.log('P2PMessaging: ConnectionManager is ready');

        // Get stored sessions (now guaranteed to be loaded)
        const storedSessions = connectionManager.getStoredSessions();
        if (storedSessions.sessions.length === 0) {
          console.log('P2PMessaging: No stored sessions found');
          setIsRecoveringConnection(false);
          return;
        }

        // Get tab-selected session or use most recent
        const tabSelection = getSelectedUser();
        let sessionToRecover = storedSessions.sessions[0]; // Default to first

        if (tabSelection?.selectedUsername && tabSelection?.selectedServerAddress) {
          const matchingSession = storedSessions.sessions.find(
            s => s.username === tabSelection.selectedUsername &&
                 s.serverAddress === tabSelection.selectedServerAddress
          );
          if (matchingSession) {
            sessionToRecover = matchingSession;
          }
        }

        if (!sessionToRecover.cid) {
          console.error('P2PMessaging: Session has no CID');
          setIsRecoveringConnection(false);
          return;
        }

        console.log('P2PMessaging: Claiming session:', sessionToRecover.cid);

        // Claim the session
        try {
          await websocketService.claimSession(sessionToRecover.cid, true);
          console.log('P2PMessaging: Session claimed successfully');
        } catch (claimError: any) {
          if (claimError?.message?.includes('not orphaned')) {
            console.log('P2PMessaging: Session already active, no claim needed');
          } else {
            throw claimError;
          }
        }

        // Set up workspace context
        setSelectedUser({
          selectedUsername: sessionToRecover.username,
          selectedServerAddress: sessionToRecover.serverAddress,
          selectedCid: sessionToRecover.cid
        });

        // Set connection ID in WorkspaceService
        WorkspaceService.setConnectionId(sessionToRecover.cid);

        // Trigger workspace loading
        WorkspaceService.loadWorkspace();
        WorkspaceService.listOffices();

        // Update connection info state
        setConnectionInfo({ cid: sessionToRecover.cid });

        console.log('P2PMessaging: Connection recovered successfully');
      } catch (error) {
        console.error('P2PMessaging: Failed to recover connection:', error);
      } finally {
        setIsRecoveringConnection(false);
      }
    };

    recoverConnection();
  }, []);
  
  // For development: use a mock CID if the real one isn't available
  // Convert to string for proper comparison with message.senderCid (which is a string)
  const currentUserCid = connectionInfo?.cid !== undefined ? String(connectionInfo.cid) : 'mock-user-cid';

  // Show loading state while recovering connection
  if (isRecoveringConnection) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="h-12 w-12 mx-auto mb-3 animate-spin text-purple-500" />
          <p className="text-lg font-medium">Recovering connection...</p>
          <p className="text-sm text-muted-foreground">Please wait</p>
        </div>
      </div>
    );
  }

  // Show error if no connection available
  if (!connectionInfo?.cid) {
    return (
      <div className="flex items-center justify-center h-full">
        <Alert className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please connect to a workspace to use P2P messaging.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-80 border-r">
        <P2PPeerList
          selectedPeerCid={selectedPeerCid}
          onSelectPeer={setSelectedPeerCid}
        />
      </div>
      
      <div className="flex-1">
        {selectedPeerCid ? (
          <P2PChat
            peerCid={selectedPeerCid}
            currentUserCid={currentUserCid}
            peerName={`User ${selectedPeerCid.slice(0, 8)}...`}
            currentUserName={'You'}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm">Choose a peer from the list to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}