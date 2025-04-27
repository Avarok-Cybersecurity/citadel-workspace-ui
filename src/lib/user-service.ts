import { invoke } from '@tauri-apps/api/core';
import NotificationService, { NotificationPriority } from './notification-service';

// Interface for user registration information
export interface UserRegistrationInfo {
  username: string;
  fullName: string;
  serverAddress: string;
  serverPassword?: string;
}

/**
 * UserService - provides access to user profile information
 */
export class UserService {
  private static instance: UserService;
  private currentUser: UserRegistrationInfo | null = null;
  private notificationService: NotificationService;
  private userChangeHandlers: Array<(user: UserRegistrationInfo | null) => void> = [];
  
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
      // Call the get_registration command from the backend using CID for identification
      const result = await invoke('get_registration', { 
        serverAddress,
        cid // Use the connection ID to identify the user
      });
      
      // Parse the result
      if (result) {
        const registrationInfo = result as any;
        this.currentUser = {
          username: registrationInfo.username,
          fullName: registrationInfo.full_name,
          serverAddress: registrationInfo.server_address,
          serverPassword: registrationInfo.server_password
        };
        
        // Notify all handlers of the user change
        this.notifyUserChange();
        
        return this.currentUser;
      }
    } catch (error) {
      console.error('Error loading user registration:', error);
      this.notificationService.addSystemNotification(
        'User Profile Error',
        `Could not load user profile: ${error}`,
        NotificationPriority.HIGH
      );
    }
    
    return null;
  }
  
  /**
   * Get the current user's registration information
   */
  public getCurrentUser(): UserRegistrationInfo | null {
    return this.currentUser;
  }
  
  /**
   * Register a callback to be notified when the user information changes
   */
  public onUserChange(handler: (user: UserRegistrationInfo | null) => void): void {
    // Add handler to the list
    this.userChangeHandlers.push(handler);
    
    // If there's already a user loaded, notify the handler immediately
    if (this.currentUser) {
      handler(this.currentUser);
    }
  }
  
  /**
   * Notify all registered handlers of user changes
   */
  private notifyUserChange(): void {
    this.userChangeHandlers.forEach(handler => {
      try {
        handler(this.currentUser);
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
  }
}

// Export singleton instance for convenience
export default UserService.getInstance();
