import { invoke } from '@tauri-apps/api/core';
import { SecurityLevel, MessageSendSuccessTS, MessageSendFailureTS } from '@/types';
import { WorkspaceProtocolPayloadTS, WorkspaceProtocolRequestTS } from '@/types/workspace-protocol';
import { Office } from '@/types/workspace-entities';

/**
 * Workspace Service
 * 
 * Provides methods for interacting with workspace protocol via the message command.
 * WorkspaceProtocolRequests/Responses/Payloads ONLY work over the Message variant
 * for InternalServiceCommands.
 * 
 * NOTE: This should only work for servers, not clients. Commands for clients should go via workspace-protocl.ts
 */
export class WorkspaceService {
  private static instance: WorkspaceService;
  private currentCid: string | null = null;

  private constructor() { }

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
  private async sendWorkspaceRequest(payload: WorkspaceProtocolPayloadTS): Promise<MessageSendSuccessTS | MessageSendFailureTS> {
    if (!this.currentCid) {
      throw new Error('No active connection available. Please connect first.');
    }

    try {
      console.info('[WorkspaceService] Sending payload:', payload);
      // Invoke returns 'unknown', so we need to assert/check the type
      const response = await invoke<MessageSendSuccessTS | MessageSendFailureTS>(
        'send_workspace_request',
        {
          cidStr: this.currentCid,
          securityLevelStr: SecurityLevel.Standard, // Pass security level string
          payload: payload // Pass the structured payload object
        }
      );

      // Type guard to check if it's a failure response
      if (typeof response === 'object' && response !== null && 'message' in response && typeof (response as any).message === 'string') {
        const failureResponse = response as MessageSendFailureTS;
        console.error("[WorkspaceService] Workspace request failed:", failureResponse);
        throw new Error(failureResponse.message);
      }

      // Assuming success if it's not explicitly a failure
      console.info('[WorkspaceService] Request sent successfully:', response);
      return response as MessageSendSuccessTS; // Cast to success type after check

    } catch (error) {
      // Handle errors from invoke itself or re-throw errors identified by the type guard
      if (error instanceof Error) {
        console.error(`[WorkspaceService] Error sending request:`, error.message);
        throw error; // Re-throw the original error
      } else {
        console.error(`[WorkspaceService] Unknown error sending request:`, error);
        throw new Error('An unknown error occurred while sending the workspace request.');
      }
    }
  }

  /**
   * Load workspace data
   * This will trigger a workspace:loaded event when complete
   */
  public async loadWorkspace(): Promise<any> {
    // NOTE: WorkspaceProtocolRequestTS doesn't define 'LoadWorkspace'. 
    // Using 'listOffices' as a placeholder to satisfy TS, but the type definition 
    // might need alignment with the Rust enum's LoadWorkspace variant.
    const requestPart: WorkspaceProtocolRequestTS = {
      listOffices: true
    };
    // Construct the full payload expected by the Rust command (lowercase 'request')
    const payload: WorkspaceProtocolPayloadTS = { request: requestPart };
    return this.sendWorkspaceRequest(payload);
  }

  /**
   * Get the current workspace
   * This will trigger a workspace:loaded event when complete
   */
  public async getWorkspace(): Promise<MessageSendSuccessTS | MessageSendFailureTS> {
    // Using listOffices as placeholder payload
    const requestPart: WorkspaceProtocolRequestTS = { listOffices: true };
    const payload: WorkspaceProtocolPayloadTS = { request: requestPart }; // lowercase 'request'
    return this.sendWorkspaceRequest(payload);
  }

  /**
   * List all offices in the workspace
   * This will trigger an offices:loaded event when complete
   */
  public async listOffices(): Promise<MessageSendSuccessTS | MessageSendFailureTS> {
    const requestPart: WorkspaceProtocolRequestTS = {
      listOffices: true
    };
    const payload: WorkspaceProtocolPayloadTS = { request: requestPart }; // lowercase 'request'
    return this.sendWorkspaceRequest(payload);
  }

  /**
   * List all rooms in an office
   * This will trigger a rooms:loaded event when complete
   * @param officeId The ID of the office to get rooms for
   */
  public async listRooms(officeId: string): Promise<MessageSendSuccessTS | MessageSendFailureTS> {
    const requestPart: WorkspaceProtocolRequestTS = {
      listRooms: { office_id: officeId }
    };
    const payload: WorkspaceProtocolPayloadTS = { request: requestPart }; // lowercase 'request'
    return this.sendWorkspaceRequest(payload);
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
