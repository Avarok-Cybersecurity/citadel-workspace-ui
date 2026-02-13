import { v4 as uuidv4 } from 'uuid';
import { MessagingService } from './messaging-service';
import NotificationService, { NotificationType, NotificationPriority } from './notification-service';
import { websocketService } from './websocket-service';
import { eventEmitter } from './event-emitter';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

export enum ConnectionRequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  CANCELED = 'canceled'
}

export enum ConnectionType {
  P2P_REGISTRATION = 'p2p_registration',  // Requires manual acceptance unless auto-accept is on
  P2P_CONNECTION = 'p2p_connection'       // Auto-accepted by default
}

export interface ConnectionRequest {
  id: string;
  requesterId: string;
  recipientId: string;
  type: ConnectionType;
  status: ConnectionRequestStatus;
  message?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserConnection {
  userId: string;
  connectedUserId: string;
  isRegistered: boolean;   // P2P registration complete
  isConnected: boolean;    // P2P connection complete
  createdAt: number;
  updatedAt: number;
}

export interface UserConnectionPreferences {
  autoAcceptRegistrations: boolean;  // Automatically accept P2P registration requests
}

export interface ConnectionStatus {
  cid: bigint | string | null;
  isConnected: boolean;
  userContext?: { selectedUsername: string | null; selectedServerAddress: string | null; selectedCid?: bigint };
}

export class ConnectionService {
  private static instance: ConnectionService;
  private messagingService: MessagingService | null = null;
  private notificationService: NotificationService;
  private connectionRequests: ConnectionRequest[] = [];
  private userConnections: Map<string, UserConnection[]> = new Map();
  private userPreferences: Map<string, UserConnectionPreferences> = new Map();
  private onConnectionRequestStatusChange: ((request: ConnectionRequest) => void) | null = null;
  private onNewConnectionRequest: ((request: ConnectionRequest) => void) | null = null;
  private connectionChangeHandlers: Array<(connection: ConnectionStatus) => void> = [];
  private currentConnection: ConnectionStatus | null = null;

  private constructor() {
    // Don't initialize MessagingService here to break the circular dependency
    this.notificationService = NotificationService.getInstance();

    // Set default preferences for current user (auto-accept registrations off)
    this.userPreferences.set('current-user', {
      autoAcceptRegistrations: false
    });

    // Setup event listeners for connection events
    this.setupEventListeners();
  }

  public static getInstance(): ConnectionService {
    if (!ConnectionService.instance) {
      ConnectionService.instance = new ConnectionService();
    }
    return ConnectionService.instance;
  }

  // Lazy initialize the messaging service when needed
  private getMessagingService(): MessagingService {
    if (!this.messagingService) {
      this.messagingService = MessagingService.getInstance();
    }
    return this.messagingService;
  }

  private setupEventListeners() {
    debugLog('ConnectionService', 'Setting up connection service event listeners');

    // Listen for p2p registration responses
    // Listen for p2p connection responses
    
    // Listen for broadcast connection status updates from other tabs
    eventEmitter.on('broadcast-connection-status', (status: { isConnected: boolean; cid?: string }) => {
      debugLog('ConnectionService', 'ConnectionService: Received broadcast connection status', status);
      
      // Update our connection status based on the broadcast
      this.updateConnectionStatus({
        cid: status.cid || null,
        isConnected: status.isConnected
      });
    });
  }

  /**
   * Send a P2P registration request to another user
   */
  public async sendRegistrationRequest(
    recipientId: string,
    message: string = "I'd like to connect with you"
  ): Promise<ConnectionRequest> {
    const requestId = uuidv4();
    const timestamp = Date.now();

    // Create a new request
    const request: ConnectionRequest = {
      id: requestId,
      requesterId: 'current-user', // This would be the actual user ID in production
      recipientId: recipientId,
      type: ConnectionType.P2P_REGISTRATION,
      status: ConnectionRequestStatus.PENDING,
      message: message,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    try {
      debugLog('ConnectionService', `Sending P2P registration request to ${recipientId}`);

      // Store the request locally
      this.connectionRequests.push(request);

      // Simulate a response for demo purposes
      setTimeout(() => {
        this.simulateRequestReceived(request);
      }, 1500);

      return request;
    } catch (error) {
      console.error('Failed to send registration request:', error);
      throw error;
    }
  }

  /**
   * Automatically called when a P2P registration is accepted
   * This initiates a P2P connection for messaging
   */
  private async initiateP2PConnection(recipientId: string): Promise<void> {
    const requestId = uuidv4();
    const timestamp = Date.now();

    // Create a new request for P2P connection
    const request: ConnectionRequest = {
      id: requestId,
      requesterId: 'current-user', // This would be the actual user ID in production
      recipientId: recipientId,
      type: ConnectionType.P2P_CONNECTION,
      status: ConnectionRequestStatus.PENDING,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    try {
      debugLog('ConnectionService', `Initiating P2P connection with ${recipientId}`);

      // Store the request locally
      this.connectionRequests.push(request);

      // For demo purposes, we'll auto-accept P2P connections
      setTimeout(() => {
        runAsyncSetup(async () => {
          await this.autoAcceptConnection(request);
        });
      }, 1000);

    } catch (error) {
      console.error('Failed to initiate P2P connection:', error);
      throw error;
    }
  }

  /**
   * Handle a connection request being accepted
   */
  public async acceptConnectionRequest(requestId: string): Promise<void> {
    const request = this.connectionRequests.find(req => req.id === requestId);
    if (!request) {
      throw new Error(`Connection request ${requestId} not found`);
    }

    if (request.status !== ConnectionRequestStatus.PENDING) {
      throw new Error(`Connection request ${requestId} is not pending`);
    }

    try {
      debugLog('ConnectionService', `Accepting connection request ${requestId}`);

      // Update the request status
      request.status = ConnectionRequestStatus.ACCEPTED;
      request.updatedAt = Date.now();

      // If this is a registration request, create a connection
      if (request.type === ConnectionType.P2P_REGISTRATION) {
        this.createConnection(request.requesterId, true, false);

        // After registration is accepted, initiate a P2P connection
        await this.initiateP2PConnection(request.requesterId);
      } else if (request.type === ConnectionType.P2P_CONNECTION) {
        // If this is a connection request, update the connection
        this.updateConnection(request.requesterId, true, true);
      }

      // Notify listeners
      if (this.onConnectionRequestStatusChange) {
        this.onConnectionRequestStatusChange(request);
      }

    } catch (error) {
      console.error('Failed to accept connection request:', error);
      throw error;
    }
  }

  /**
   * Handle a connection request being rejected
   */
  public async rejectConnectionRequest(requestId: string): Promise<void> {
    const request = this.connectionRequests.find(req => req.id === requestId);
    if (!request) {
      throw new Error(`Connection request ${requestId} not found`);
    }

    if (request.status !== ConnectionRequestStatus.PENDING) {
      throw new Error(`Connection request ${requestId} is not pending`);
    }

    try {
      debugLog('ConnectionService', `Rejecting connection request ${requestId}`);

      // Update the request status
      request.status = ConnectionRequestStatus.REJECTED;
      request.updatedAt = Date.now();

      // Notify listeners
      if (this.onConnectionRequestStatusChange) {
        this.onConnectionRequestStatusChange(request);
      }

    } catch (error) {
      console.error('Failed to reject connection request:', error);
      throw error;
    }
  }

  /**
   * Handle a connection request being canceled by the requester
   */
  public async cancelConnectionRequest(requestId: string): Promise<void> {
    const request = this.connectionRequests.find(req => req.id === requestId);
    if (!request) {
      throw new Error(`Connection request ${requestId} not found`);
    }

    if (request.status !== ConnectionRequestStatus.PENDING) {
      throw new Error(`Connection request ${requestId} is not pending`);
    }

    try {
      debugLog('ConnectionService', `Canceling connection request ${requestId}`);

      // Update the request status
      request.status = ConnectionRequestStatus.CANCELED;
      request.updatedAt = Date.now();

      // Notify listeners
      if (this.onConnectionRequestStatusChange) {
        this.onConnectionRequestStatusChange(request);
      }

    } catch (error) {
      console.error('Failed to cancel connection request:', error);
      throw error;
    }
  }

  /**
   * Create a new connection between users
   */
  private createConnection(
    userId: string,
    isRegistered: boolean,
    isConnected: boolean
  ): UserConnection {
    const timestamp = Date.now();

    const connection: UserConnection = {
      userId: 'current-user', // This would be the actual user ID in production
      connectedUserId: userId,
      isRegistered,
      isConnected,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Get existing connections for the user
    const userConnectionList = this.userConnections.get('current-user') || [];

    // Add the new connection
    userConnectionList.push(connection);

    // Update the map
    this.userConnections.set('current-user', userConnectionList);

    return connection;
  }

  /**
   * Update an existing connection between users
   */
  private updateConnection(
    userId: string,
    isRegistered?: boolean,
    isConnected?: boolean
  ): UserConnection | null {
    // Get existing connections for the user
    const userConnectionList = this.userConnections.get('current-user') || [];

    // Find the connection
    const connectionIndex = userConnectionList.findIndex(conn => conn.connectedUserId === userId);
    if (connectionIndex === -1) {
      return null;
    }

    // Update the connection
    const connection = userConnectionList[connectionIndex];
    if (isRegistered !== undefined) {
      connection.isRegistered = isRegistered;
    }
    if (isConnected !== undefined) {
      connection.isConnected = isConnected;
    }
    connection.updatedAt = Date.now();

    // Update the list
    userConnectionList[connectionIndex] = connection;

    // Update the map
    this.userConnections.set('current-user', userConnectionList);

    return connection;
  }

  /**
   * Check if a user can message another user
   * Requires both P2P registration and P2P connection to be completed
   */
  public canMessageUser(userId: string): boolean {
    const userConnectionList = this.userConnections.get('current-user') || [];
    const connection = userConnectionList.find(conn => conn.connectedUserId === userId);

    // To message a user, registration and connection must be complete
    return connection?.isRegistered === true && connection?.isConnected === true;
  }

  /**
   * Get all pending connection requests for the current user
   */
  public getPendingRequests(): ConnectionRequest[] {
    return this.connectionRequests.filter(req =>
      req.recipientId === 'current-user' &&
      req.status === ConnectionRequestStatus.PENDING
    );
  }

  /**
   * Get all connection requests involving the current user
   */
  public getAllRequests(): ConnectionRequest[] {
    return this.connectionRequests.filter(req =>
      req.recipientId === 'current-user' || req.requesterId === 'current-user'
    );
  }

  /**
   * Get all connections for the current user
   */
  public getUserConnections(): UserConnection[] {
    return this.userConnections.get('current-user') || [];
  }

  /**
   * Set user preferences for connection requests
   */
  public setUserPreferences(preferences: Partial<UserConnectionPreferences>): void {
    const currentPrefs = this.userPreferences.get('current-user') || {
      autoAcceptRegistrations: false
    };

    // Update preferences
    this.userPreferences.set('current-user', {
      ...currentPrefs,
      ...preferences
    });

    debugLog('ConnectionService', 'User preferences updated:', this.userPreferences.get('current-user'));
  }

  /**
   * Get user preferences for connection requests
   */
  public getUserPreferences(): UserConnectionPreferences {
    return this.userPreferences.get('current-user') || {
      autoAcceptRegistrations: false
    };
  }

  /**
   * Get the auto-accept setting for registration requests
   */
  public getAutoAcceptRegistrations(): boolean {
    const preferences = this.getUserPreferences();
    return preferences.autoAcceptRegistrations;
  }

  /**
   * Set the auto-accept setting for registration requests
   */
  public setAutoAcceptRegistrations(autoAccept: boolean): void {
    this.setUserPreferences({ autoAcceptRegistrations: autoAccept });
  }

  /**
   * Register a callback for connection request status changes
   */
  public setConnectionStatusChangeHandler(handler: (request: ConnectionRequest) => void): void {
    this.onConnectionRequestStatusChange = handler;
  }

  /**
   * Register a callback for new connection requests
   */
  public setNewConnectionRequestHandler(handler: (request: ConnectionRequest) => void): void {
    this.onNewConnectionRequest = handler;
  }

  /**
   * Register a callback to be notified when the connection status changes
   * @param handler Callback function that receives the new connection information
   */
  public onConnectionChange(handler: (connection: ConnectionStatus) => void): void {
    // Add handler to the list
    this.connectionChangeHandlers.push(handler);

    // If there's already an active connection, notify the handler immediately
    if (this.currentConnection) {
      handler(this.currentConnection);
    }
  }

  /**
   * Update the current connection status and notify all handlers
   * @param connection The new connection information
   */
  public updateConnectionStatus(connection: ConnectionStatus): void {
    debugLog('ConnectionService', `updateConnectionStatus: cid=${connection?.cid?.toString()}, isConnected=${connection?.isConnected}, handlers=${this.connectionChangeHandlers.length}`);
    this.currentConnection = connection;

    // Notify all registered handlers
    this.connectionChangeHandlers.forEach(handler => {
      try {
        debugLog('ConnectionService', `Calling handler`);
        handler(connection);
      } catch (error) {
        console.error('Error in connection change handler:', error);
      }
    });
  }

  /** 
   * Clean up event listeners
   */
  public cleanup(): void {
    this.onConnectionRequestStatusChange = null;
    this.onNewConnectionRequest = null;
    this.connectionChangeHandlers = [];
  }

  // DEMO METHODS - These simulate the backend functionality for demonstration purposes

  /**
   * Simulate receiving a connection request
   */
  public simulateRequestReceived(request: ConnectionRequest): void {
    // Check if this is a P2P registration request to us
    if (request.type === ConnectionType.P2P_REGISTRATION &&
      request.recipientId === 'current-user') {

      // Create a notification for the connection request
      this.notificationService.addNotification({
        type: NotificationType.PEER_REGISTRATION,
        title: 'New Connection Request',
        content: request.message || `User ${request.requesterId} wants to connect with you`,
        senderId: request.requesterId,
        sourceId: request.id,
        priority: NotificationPriority.NORMAL,
        actionButtons: [
          {
            id: 'accept',
            label: 'Accept',
            variant: 'default',
            onClick: () => this.acceptConnectionRequest(request.id)
          },
          {
            id: 'reject',
            label: 'Reject',
            variant: 'destructive',
            onClick: () => this.rejectConnectionRequest(request.id)
          }
        ]
      });

      // Check if auto-accept is enabled for registrations
      const preferences = this.getUserPreferences();
      if (preferences.autoAcceptRegistrations) {
        // Auto-accept the request
        setTimeout(() => {
          runAsyncSetup(async () => {
            await this.acceptConnectionRequest(request.id);
          });
        }, 1000);
      }

      // Notify listeners of the new request
      if (this.onNewConnectionRequest) {
        this.onNewConnectionRequest(request);
      }
    }
  }

  /**
   * Auto-accept P2P connection requests (these are always auto-accepted)
   */
  private async autoAcceptConnection(request: ConnectionRequest): Promise<void> {
    if (request.type === ConnectionType.P2P_CONNECTION) {
      // Show notification but auto-accept
      this.notificationService.addSystemNotification(
        'Connection Established',
        `Your connection with user ${request.requesterId} has been automatically established.`,
        NotificationPriority.NORMAL,
        request.recipientId // Associate with the recipient's session
      );

      await this.acceptConnectionRequest(request.id);
    }
  }
}
