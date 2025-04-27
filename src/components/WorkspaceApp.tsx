import React, { useEffect } from 'react';
import { WorkspaceEventHandler } from './WorkspaceEventHandler';
import { ErrorDisplay } from './ui/error-display';
import { ProtocolWarning } from './ui/protocol-warning';
import NotificationService, { NotificationPriority } from '@/lib/notification-service';
import { MessagingService } from '@/lib/messaging-service';
import { ConnectionService } from '@/lib/connection-service';
import WorkspaceService from '@/lib/workspace-service';
import UserService from '@/lib/user-service';

/**
 * WorkspaceApp is the main container component that provides:
 * 1. Event handling and state management through WorkspaceEventHandler
 * 2. Error and warning notifications
 * 3. Global UI elements
 * 4. Centralized notification system
 */
export const WorkspaceApp: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize services that use notifications
  useEffect(() => {
    // Initialize required services to ensure they're instantiated
    // This will set up their event listeners and notification handlers
    const notificationService = NotificationService.getInstance();
    const messagingService = MessagingService.getInstance();
    const connectionService = ConnectionService.getInstance();
    const userService = UserService;

    // Connection change listener - load workspace data when user connects
    connectionService.onConnectionChange((connection) => {
      if (connection && connection.cid) {
        // Set the connection ID in the workspace service
        WorkspaceService.setConnectionId(connection.cid);

        // Load user registration info based on connection
        // Always use CID for identification when retrieving user data
        userService.loadUserRegistration(connection.serverAddress, connection.cid)
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
              NotificationPriority.HIGH
            );
          });
      }
    });

    // Test notification (can be removed in production)
    setTimeout(() => {
      notificationService.addSystemNotification(
        'Welcome to Citadel Workspace',
        'Your secure workspace is ready. Explore the features and connect with your team.',
        NotificationPriority.NORMAL
      );
    }, 2000);

    // Clean up event listeners when component unmounts
    return () => {
      messagingService.cleanup();
      connectionService.cleanup();
      WorkspaceService.cleanup();
      userService.cleanup();
    };
  }, []);

  return (
    <WorkspaceEventHandler>
      {/* Application content */}
      {children}

      {/* Notifications */}
      <ErrorDisplay />
      <ProtocolWarning />
    </WorkspaceEventHandler>
  );
};

export default WorkspaceApp;
