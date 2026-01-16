import React, { useEffect, useState } from 'react';
import { WorkspaceEventHandler } from './WorkspaceEventHandler';
import { ErrorDisplay } from './ui/error-display';
import { ProtocolWarning } from './ui/protocol-warning';
import { ConnectionRetryModal } from './ConnectionRetryModal';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import NotificationService, { NotificationPriority } from '@/lib/notification-service';
import { MessagingService } from '@/lib/messaging-service';
import { ConnectionService } from '@/lib/connection-service';
import WorkspaceService from '@/lib/workspace-service';
import UserService from '@/lib/user-service';
import { websocketService } from '@/lib/websocket-service';
import { connectionManager } from '@/lib/connection-manager';
import { eventEmitter } from '@/lib/event-emitter';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { getUserFriendlyErrorMessage } from '@/lib/error-messages';
import { healthCheckService } from '@/lib/health-check';
import { getSelectedUser, setSelectedUser } from '@/lib/tab-context';
// Import sessionStartupService to ensure it's instantiated (sets up event listeners)
// P2P startup is now centralized here - triggered by 'session:activated' event
import '@/lib/session-startup-service';

/**
 * WorkspaceApp is the main container component that provides:
 * 1. Event handling and state management through WorkspaceEventHandler
 * 2. Error and warning notifications
 * 3. Global UI elements
 * 4. Centralized notification system
 */
export const WorkspaceApp: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showConnectionRetry, setShowConnectionRetry] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [orphanSessionCid, setOrphanSessionCid] = useState<string | null>(null);
  const { toast } = useToast();

  // Initialize services that use notifications
  useEffect(() => {
    // Initialize ConnectionManager which handles WebSocket initialization
    const initializeServices = async () => {
      try {
        console.log('Starting ConnectionManager initialization...');
        
        // Start health checks
        healthCheckService.startHealthChecks(10000); // Check every 10 seconds
        
        await connectionManager.initialize();
        console.log('ConnectionManager initialized successfully');

        // Note: Orphan mode is already enabled by connectionManager.initialize() (non-blocking)

        // P2P startup is now handled by SessionStartupService
        // It listens for 'session:activated' events and triggers P2P connection
        // This centralized approach ensures P2P works after ClaimSession too
      } catch (error) {
        console.error('Failed to initialize ConnectionManager:', error);
        // Don't prevent app from loading if initialization fails
        // User will see connection error when they try to connect
      }
    };

    void initializeServices();
    
    // Initialize required services to ensure they're instantiated
    // This will set up their event listeners and notification handlers
    const notificationService = NotificationService.getInstance();
    const messagingService = MessagingService.getInstance();
    const connectionService = ConnectionService.getInstance();
    const userService = UserService;

    // Track the last processed CID to prevent redundant workspace reloads
    // This is critical to prevent flickering when BroadcastChannel sends connection-status
    let lastProcessedCid: string | null = null;

    // Connection change listener - load workspace data when user connects
    connectionService.onConnectionChange(async (connection) => {
      // CID 0 is the service connection, not a user session - skip it
      const cidValue = typeof connection?.cid === 'string' ? parseInt(connection.cid, 10) : connection?.cid;
      if (connection && connection.cid && cidValue !== 0) {
        // CRITICAL: Only reload workspace if CID actually changed
        // This prevents flickering when BroadcastChannel broadcasts connection-status for same CID
        const cidString = connection.cid.toString();
        if (lastProcessedCid === cidString) {
          console.log('WorkspaceApp: Skipping redundant connection update for CID:', cidString);
          return;
        }

        // CRITICAL: Only process connection updates for THIS tab's session
        // In multi-tab scenarios, BroadcastChannel sends connection-status for ALL sessions
        // Each tab must only respond to updates for its own selected user
        const tabSelection = await getSelectedUser();
        if (tabSelection?.selectedCid && tabSelection.selectedCid !== cidString) {
          console.log(`WorkspaceApp: Ignoring connection update for CID ${cidString} (tab has CID ${tabSelection.selectedCid})`);
          return;
        }

        lastProcessedCid = cidString;

        console.log('WorkspaceApp: Valid user session detected, CID:', connection.cid);
        // Set the connection ID in the workspace service
        WorkspaceService.setConnectionId(connection.cid);

        // Emit session:activated to trigger P2P startup (handled by SessionStartupService)
        // Get username from stored session if available
        const storedSession = connectionManager.getStoredSessionsArray().find(
          s => s.cid === cidString || s.cid === connection.cid?.toString()
        );
        
        if (!storedSession) {
          console.error('No stored session found for CID:', cidString);
          return;
        }
        
        eventEmitter.emit('session:activated', {
          cid: cidString,
          username: storedSession.username,
          serverAddress: storedSession.serverAddress,
          activationType: 'connect' as const
        });
        console.log('WorkspaceApp: Emitted session:activated for connection');

        // Load user registration info based on connection
        // Always use CID for identification when retrieving user data
        userService.loadUserRegistration(storedSession.serverAddress, connection.cid)
          .then(userInfo => {
            console.info('User registration info loaded:', userInfo);
          })
          .catch(error => {
            console.error('Error loading user registration info:', error);
          });

        // Load workspace data
        WorkspaceService.loadWorkspace()
          .then(() => {
            console.info('Workspace loading initiated');

            // After workspace is loaded, load all offices
            return WorkspaceService.listOffices();
          })
          .then(() => {
            console.info('Offices loading initiated');

            // After initiating office loading, we'll handle loading rooms via event listeners
            // in WorkspaceEventHandler when the offices are loaded
          })
          .catch((error) => {
            console.error('Error loading workspace data:', error);
            notificationService.addSystemNotification(
              'Workspace Error',
              `Could not load workspace data: ${error.message}`,
              NotificationPriority.HIGH,
              cidString // Associate with the session
            );
          });

        // Welcome notification - inside connection handler to have access to cidString
        // Fires 2 seconds after successful connection
        setTimeout(() => {
          notificationService.addSystemNotification(
            'Welcome to Citadel Workspace',
            'Your secure workspace is ready. Explore the features and connect with your team.',
            NotificationPriority.NORMAL,
            cidString // Associate with the session
          );
        }, 2000);
      }
    });

    // Listen for WebSocket connection failures
    const handleConnectionFailure = (event: { error: string }) => {
      console.error('WebSocket connection failure:', event.error);
      setConnectionError(event.error);
      setShowConnectionRetry(true);
    };

    // Listen for session already connected errors
    const handleSessionAlreadyConnected = async (event: { cid: string; message: string }) => {
      console.log('Session already connected event:', event);
      
      // Show user-friendly message about orphaned session
      toast({
        title: "Session Already Connected",
        description: "You are already connected in another window or tab. Please close other connections first or wait a moment and try again.",
        variant: "destructive",
        action: (
          <ToastAction altText="Try again" onClick={async () => {
            // Try to disconnect orphaned sessions
            try {
              await websocketService.setOrphanMode(true);
              // Disconnect all orphan sessions (pass null to disconnect all)
              await websocketService.disconnectOrphan(null);
              
              toast({
                title: "Orphaned sessions cleared",
                description: "Please try logging in again"
              });
            } catch (error) {
              console.error('Failed to disconnect orphan sessions:', error);
            }
          }}>
            Clear Sessions
          </ToastAction>
        )
      });
      
      // Don't show the connection retry modal for session already connected errors
      setShowConnectionRetry(false);
    };

    // Set up event listeners
    eventEmitter.on('connection-failure', handleConnectionFailure);
    eventEmitter.on('session-already-connected', handleSessionAlreadyConnected);

    // Clean up event listeners when component unmounts
    return () => {
      void messagingService.cleanup();
      void connectionService.cleanup();
      void WorkspaceService.cleanup();
      void userService.cleanup();
      healthCheckService.stopHealthChecks();
      eventEmitter.off('connection-failure', handleConnectionFailure);
      eventEmitter.off('session-already-connected', handleSessionAlreadyConnected);
    };
  }, []);

  return (
    <PermissionsProvider>
      <WorkspaceEventHandler>
        {/* Application content */}
        {children}

        {/* Notifications */}
        <ErrorDisplay />
        <ProtocolWarning />
      
      {/* Connection Retry Modal */}
      <ConnectionRetryModal
        isOpen={showConnectionRetry}
        onClose={() => setShowConnectionRetry(false)}
        errorMessage={connectionError || undefined}
        onRetry={async () => {
          // If we have an orphan session, try to claim it
          if (orphanSessionCid) {
            try {
              await websocketService.setOrphanMode(true);
              const result = await websocketService.claimSession(orphanSessionCid, true);
              
              if (result.cid) {
                ConnectionService.getInstance().updateConnectionStatus({
                  cid: result.cid,
                  isConnected: true
                });
                setShowConnectionRetry(false);
                return;
              }
            } catch (error) {
              console.error('Failed to claim orphan session during retry:', error);
              throw error;
            }
          }
          
          // Otherwise, just try to reconnect
          await websocketService.init();
        }}
      />
      </WorkspaceEventHandler>
    </PermissionsProvider>
  );
};

export default WorkspaceApp;
