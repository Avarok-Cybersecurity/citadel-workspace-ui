import NotificationService, { NotificationPriority } from './notification-service';
import { websocketService } from './websocket-service';
import { getTabData, setTabData, removeTabData } from './tab-context';
import { connectionManager } from './connection-manager';

// Interface for user registration information
export interface UserRegistrationInfo {
  username: string;
  fullName: string;
  serverAddress: string;
  serverPassword?: string;
}

/**
 * UserService - provides access to user profile information
 * Now maintains per-tab user state for proper isolation
 */
export class UserService {
  private static instance: UserService;
  private notificationService: NotificationService;
  private userChangeHandlers: Array<(user: UserRegistrationInfo | null) => void> = [];
  private static readonly TAB_USER_KEY = 'current-user';
  
  private constructor() {
    this.notificationService = NotificationService.getInstance();
  }
  
  /**
   * Get the singleton instance of the user service
   */
  public static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }
  
  /**
   * Load the current user's registration information
   * @param serverAddress Server address to get registration info for
   * @param cid Connection ID for the user (important: always use CID for identification)
   */
  public async loadUserRegistration(serverAddress: string, cid: string): Promise<UserRegistrationInfo | null> {
    try {
      // First check if we have a tab-selected session that matches
      const selectedSession = connectionManager.getTabSelectedSession();
      
      if (selectedSession && selectedSession.serverAddress === serverAddress) {
        // Use the selected session's user info
        const userInfo: UserRegistrationInfo = {
          username: selectedSession.username,
          fullName: selectedSession.fullName || selectedSession.username,
          serverAddress: selectedSession.serverAddress,
          serverPassword: undefined,
        };
        
        // Store in tab-specific storage
        this.setCurrentUser(userInfo);
        
        // Notify all handlers of the user change
        this.notifyUserChange();
        
        return userInfo;
      }
      
      // If no matching selected session, try to get account info via request
      const client = websocketService.getClient();
      if (!client) {
        throw new Error('WebSocket client not initialized');
      }

      // Send GetAccountInformation request
      await client.sendDirectToInternalService({
        GetAccountInformation: {
          request_id: crypto.randomUUID(),
          cid: cid,
        },
      });

      // For now, return a placeholder until we get the response
      // The actual user info will be updated when we receive the response
      const placeholderUser = {
        username: 'Loading...',
        fullName: 'Loading...',
        serverAddress,
        serverPassword: undefined,
      };
      
      this.setCurrentUser(placeholderUser);
      
      // Notify all handlers of the user change
      this.notifyUserChange();
      
      return placeholderUser;
    } catch (error) {
      console.error('Error loading user registration:', error);
      this.notificationService.addSystemNotification(
        'User Profile Error',
        `Could not load user profile: ${error}`,
        NotificationPriority.HIGH,
        cid // Associate with the session
      );
    }
    
    return null;
  }
  
  /**
   * Get the current user's registration information (tab-specific)
   */
  public getCurrentUser(): UserRegistrationInfo | null {
    return getTabData<UserRegistrationInfo>(UserService.TAB_USER_KEY);
  }
  
  /**
   * Set the current user for this tab
   */
  private setCurrentUser(user: UserRegistrationInfo): void {
    setTabData(UserService.TAB_USER_KEY, user);
  }
  
  /**
   * Register a callback to be notified when the user information changes
   */
  public onUserChange(handler: (user: UserRegistrationInfo | null) => void): void {
    // Add handler to the list
    this.userChangeHandlers.push(handler);
    
    // If there's already a user loaded, notify the handler immediately
    const currentUser = this.getCurrentUser();
    if (currentUser) {
      handler(currentUser);
    }
  }
  
  /**
   * Notify all registered handlers of user changes
   */
  private notifyUserChange(): void {
    const currentUser = this.getCurrentUser();
    this.userChangeHandlers.forEach(handler => {
      try {
        handler(currentUser);
      } catch (error) {
        console.error('Error in user change handler:', error);
      }
    });
  }
  
  /**
   * Clean up event listeners
   */
  public cleanup(): void {
    this.userChangeHandlers = [];
    removeTabData(UserService.TAB_USER_KEY);
  }
}

// Export singleton instance for convenience
export default UserService.getInstance();
