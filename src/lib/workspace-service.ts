import { invoke } from '@tauri-apps/api/core';

/**
 * Workspace Service
 * 
 * Provides methods for interacting with workspace protocol via the message command.
 * WorkspaceProtocolRequests/Responses/Payloads ONLY work over the Message variant
 * for InternalServiceCommands.
 */
export class WorkspaceService {
  private static instance: WorkspaceService;
  private currentCid: string | null = null;
  
  private constructor() {}
  
  /**
   * Get the singleton instance of the workspace service
   */
  public static getInstance(): WorkspaceService {
    if (!WorkspaceService.instance) {
      WorkspaceService.instance = new WorkspaceService();
    }
    return WorkspaceService.instance;
  }
  
  /**
   * Set the current connection ID
   * @param cid Connection ID
   */
  public setConnectionId(cid: string): void {
    this.currentCid = cid;
  }
  
  /**
   * Send a workspace protocol request
   * @param request The workspace protocol request object
   * @returns Promise resolving to success or error
   */
  private async sendWorkspaceRequest(request: any): Promise<any> {
    if (!this.currentCid) {
      throw new Error('No active connection available. Please connect first.');
    }
    
    // Create the workspace protocol payload with the request
    const payload = {
      type: 'Request',
      data: request
    };
    
    // Serialize the payload to JSON string
    const jsonString = JSON.stringify(payload);
    
    // Convert the JSON string to Uint8Array for transmission
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(jsonString);
    
    // Call the message command with the serialized request
    // IMPORTANT: For server communication, we must use null for peer_cid
    try {
      return await invoke('message', {
        cid: this.currentCid,
        peer_cid: null, // Set to null to route to server
        message: messageBytes,
        security_level: 0 // Using standard security level
      });
    } catch (error) {
      console.error('Error sending workspace request:', error);
      throw error;
    }
  }
  
  /**
   * Load workspace data
   * This will trigger a workspace:loaded event when complete
   */
  public async loadWorkspace(): Promise<any> {
    return this.sendWorkspaceRequest('LoadWorkspace');
  }
  
  /**
   * Get the current workspace
   * This will trigger a workspace:loaded event when complete
   */
  public async getWorkspace(): Promise<any> {
    return this.sendWorkspaceRequest('GetWorkspace');
  }
  
  /**
   * List all offices in the workspace
   * This will trigger an offices:loaded event when complete
   */
  public async listOffices(): Promise<any> {
    return this.sendWorkspaceRequest('ListOffices');
  }
  
  /**
   * List all rooms in an office
   * This will trigger a rooms:loaded event when complete
   * @param officeId The ID of the office to get rooms for
   */
  public async listRooms(officeId: string): Promise<any> {
    return this.sendWorkspaceRequest({
      ListRooms: {
        office_id: officeId
      }
    });
  }
  
  /**
   * Cleanup resources
   */
  public cleanup(): void {
    // Any cleanup needed
  }
}

// Export singleton instance for convenience
export default WorkspaceService.getInstance();
