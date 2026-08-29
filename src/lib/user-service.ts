import NotificationService, { NotificationPriority } from './notification-service';
import { websocketService } from './websocket-service';
import { getTabData, setTabData, removeTabData } from './tab-context';
import { connectionManager } from './connection';
import { debugLog } from '@/lib/debug-config';

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
      const selectedSession = await connectionManager.getTabSelectedSession();

      if (selectedSession && selectedSession.serverAddress === serverAddress) {
        // Use the selected session's user info
        const userInfo: UserRegistrationInfo = {
          username: selectedSession.username,
          fullName: selectedSession.fullName || selectedSession.username,
          serverAddress: selectedSession.serverAddress,
          serverPassword: undefined,
        };

        // Store in tab-specific storage
        await this.setCurrentUser(userInfo);

        // Notify all handlers of the user change
        await this.notifyUserChange();

        return userInfo;
      }

      // If no matching selected session, try to get account info via request.
      //
      // `sendMessage`, not `getClient()`: a follower tab owns no client, so
      // this fallback threw there and the catch below raised a HIGH-priority
      // "User Profile Error" notification -- an alarming, permanent-looking
      // failure produced entirely by asking the wrong question. Nothing about
      // GetAccountInformation needs the raw client.
      await websocketService.sendMessage({
        GetAccountInformation: {
          request_id: crypto.randomUUID(),
          cid: BigInt(cid),
        },
      } as unknown as Record<string, unknown>);

      // For now, return a placeholder until we get the response
      // The actual user info will be updated when we receive the response
      const placeholderUser: { username: string; fullName: string; serverAddress: string; serverPassword: undefined; } = {
        username: 'Loading...',
        fullName: 'Loading...',
        serverAddress,
        serverPassword: undefined,
      };

      await this.setCurrentUser(placeholderUser);

      // Notify all handlers of the user change
      await this.notifyUserChange();

      return placeholderUser;
    } catch (error) {
      debugLog('UserService', 'Error loading user registration:', error);
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
  public async getCurrentUser(): Promise<UserRegistrationInfo | null> {
    return await getTabData<UserRegistrationInfo>(UserService.TAB_USER_KEY);
  }

  /**
   * Set the current user for this tab
   */
  private async setCurrentUser(user: UserRegistrationInfo): Promise<void> {
    await setTabData(UserService.TAB_USER_KEY, user);
  }

  /**
   * Register a callback to be notified when the user information changes
   */
  public async onUserChange(handler: (user: UserRegistrationInfo | null) => void): Promise<void> {
    // Add handler to the list
    this.userChangeHandlers.push(handler);

    // If there's already a user loaded, notify the handler immediately
    const currentUser: UserRegistrationInfo | null = await this.getCurrentUser();
    if (currentUser) {
      handler(currentUser);
    }
  }

  /**
   * Notify all registered handlers of user changes
   */
  private async notifyUserChange(): Promise<void> {
    const currentUser: UserRegistrationInfo | null = await this.getCurrentUser();
    this.userChangeHandlers.forEach(handler => {
      try {
        handler(currentUser);
      } catch (error) {
        debugLog('UserService', 'Error in user change handler:', error);
      }
    });
  }

  /**
   * Clean up event listeners
   */
  public async cleanup(): Promise<void> {
    this.userChangeHandlers = [];
    await removeTabData(UserService.TAB_USER_KEY);
  }
}

// Export singleton instance for convenience
export default UserService.getInstance();
