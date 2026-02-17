/**
 * Workspace Service - Main Service Class
 *
 * Singleton service providing workspace protocol request methods.
 * Delegates operations to focused sub-modules.
 */

import type {
  WorkspaceProtocolPayloadTS,
  WorkspaceProtocolRequestTS,
  GroupMessageTypeTS,
  PermissionTS,
  UpdateOperationTS,
  UserRoleTS,
} from '@/types/workspace-protocol';
import { websocketService } from '@/lib/websocket-service';
import type { WorkspaceProtocolRequest } from 'citadel-workspace-client-ts';
import { isVariant } from 'citadel-workspace-client-ts';
import { eventEmitter } from '@/lib/event-emitter';
import { debugLog } from '@/lib/debug-config';

import { toWasmWorkspaceRequest } from './types';
import type { ProtocolSender } from './workspace-operations';
import * as ws from './workspace-operations';
import * as members from './member-operations';
import * as messaging from './messaging-operations';
import * as nodes from './node-operations';

export class WorkspaceService implements ProtocolSender {
  private static instance: WorkspaceService;
  private _currentCid: bigint | null = null;

  private constructor() { }

  public static getInstance(): WorkspaceService {
    if (!WorkspaceService.instance) {
      WorkspaceService.instance = new WorkspaceService();
    }
    return WorkspaceService.instance;
  }

  get currentCid(): bigint | null { return this._currentCid; }

  public setConnectionId(cid: bigint): void {
    debugLog('WorkspaceService', '[WorkspaceService] setConnectionId called:', {
      newCid: cid.toString(),
      oldCid: this._currentCid?.toString() ?? 'null',
    });
    this._currentCid = cid;
  }

  public sendProtocolRequest(request: WorkspaceProtocolRequestTS): Promise<void> {
    return this.sendWorkspaceRequest({ Request: request });
  }

  public async sendWorkspaceRequest(payload: WorkspaceProtocolPayloadTS): Promise<void> {
    if (!this._currentCid) {
      throw new Error('No active connection available. Please connect first.');
    }
    try {
      debugLog('WorkspaceService', '[WorkspaceService] Sending payload:', payload);
      let request: WorkspaceProtocolRequest;
      if (isVariant(payload as Record<string, unknown>, 'Request') && payload.Request) {
        const tsRequest = payload.Request;
        if (isVariant(tsRequest as Record<string, unknown>, 'GetWorkspace')) {
          const wsReq = tsRequest.GetWorkspace;
          request = {
            GetWorkspace: {
              workspace_id: (wsReq && typeof wsReq === 'object' && 'workspace_id' in wsReq) ? wsReq.workspace_id ?? null : null
            }
          };
        } else if (typeof tsRequest === 'string' && tsRequest === 'ListWorkspaces') {
          request = 'ListWorkspaces';
        } else if (isVariant(tsRequest as Record<string, unknown>, 'CreateWorkspace')) {
          const req = tsRequest.CreateWorkspace!;
          request = {
            CreateWorkspace: {
              name: req.name,
              description: req.description,
              workspace_master_password: req.workspace_master_password,
              metadata: req.metadata ?? null
            }
          };
        } else if (isVariant(tsRequest as Record<string, unknown>, 'UpdateWorkspace')) {
          const req = tsRequest.UpdateWorkspace!;
          request = {
            UpdateWorkspace: {
              workspace_id: req.workspace_id ?? null,
              name: req.name ?? null,
              description: req.description ?? null,
              workspace_master_password: req.workspace_master_password,
              metadata: req.metadata ?? null
            }
          };
        } else {
          request = toWasmWorkspaceRequest(tsRequest);
        }
      } else {
        throw new Error('Invalid workspace protocol payload');
      }
      await websocketService.sendWorkspaceRequest(this._currentCid, request);
      debugLog('WorkspaceService', '[WorkspaceService] Request sent successfully');
    } catch (error) {
      if (error instanceof Error) {
        debugLog('WorkspaceService', 'Error sending request:', error.message);
        throw error;
      } else {
        debugLog('WorkspaceService', 'Unknown error sending request:', error);
        throw new Error('An unknown error occurred while sending the workspace request.');
      }
    }
  }

  // Workspace operations
  public loadWorkspace() { return ws.loadWorkspace(this); }
  public getWorkspace(id?: string) { return ws.getWorkspace(this, id); }
  public listWorkspaces() { return ws.listWorkspaces(this); }
  public createWorkspace(n: string, d: string, p: string, m?: Uint8Array) { return ws.createWorkspace(this, n, d, p, m); }
  public updateWorkspace(n?: string, d?: string, p?: string, m?: Uint8Array) { return ws.updateWorkspace(this, n, d, p, m); }

  // Member operations
  public addMember(userId: string, role: UserRoleTS, domainId?: string, metadata?: Uint8Array) { return members.addMember(this, userId, role, domainId, metadata); }
  public getMember(userId: string) { return members.getMember(this, userId); }
  public updateMemberRole(userId: string, role: string, metadata?: Uint8Array) { return members.updateMemberRole(this, userId, role, metadata); }
  public updateMemberPermissions(userId: string, domainId: string, perms: PermissionTS[], op: UpdateOperationTS) { return members.updateMemberPermissions(this, userId, domainId, perms, op); }
  public removeMember(userId: string, domainId?: string) { return members.removeMember(this, userId, domainId); }
  public listMembers(domainId?: string) { return members.listMembers(this, domainId); }
  public getUserPermissions(userId: string, domainId: string) { return members.getUserPermissions(this, userId, domainId); }

  // Messaging operations
  public sendMessage(contents: Uint8Array) { return messaging.sendMessage(this, contents); }
  public sendGroupMessage(gId: string, content: string, type?: GroupMessageTypeTS, replyTo?: string, mentions?: string[]) { return messaging.sendGroupMessage(this, gId, content, type, replyTo, mentions); }
  public editGroupMessage(gId: string, mId: string, content: string) { return messaging.editGroupMessage(this, gId, mId, content); }
  public deleteGroupMessage(gId: string, mId: string) { return messaging.deleteGroupMessage(this, gId, mId); }
  public getGroupMessages(gId: string, before?: number | bigint, limit?: number) { return messaging.getGroupMessages(this, gId, before, limit); }
  public getThreadMessages(gId: string, parentId: string) { return messaging.getThreadMessages(this, gId, parentId); }
  public updateUserProfile(name?: string, avatarData?: string) { return messaging.updateUserProfile(this, name, avatarData); }

  // Node operations
  public createNode(parentId: string | null, entityType: { Child: string } | 'Workspace', name: string, desc: string, opts?: { mdxContent?: string; metadata?: Uint8Array; isDefault?: boolean }) { return nodes.createNode(this, parentId, entityType, name, desc, opts); }
  public updateNode(nodeId: string, updates: { name?: string; description?: string; mdxContent?: string; rules?: string; chatEnabled?: boolean; isDefault?: boolean }) { return nodes.updateNode(this, nodeId, updates); }
  public deleteNode(nodeId: string, cascade?: boolean) { return nodes.deleteNode(this, nodeId, cascade); }
  public listNodes(parentId?: string | null, entityTypes?: Array<{ Child: string } | 'Workspace'>) { return nodes.listNodes(this, parentId, entityTypes); }
  public getTreeStructure(rootId?: string, maxDepth?: number) { return nodes.getTreeStructure(this, rootId, maxDepth); }
  public getTreeSchema() { return nodes.getTreeSchema(this); }
  public getServerCapabilities() { return nodes.getServerCapabilities(this); }

  public cleanup(): void { /* Any cleanup needed */ }

  // ========== Raw Protocol Request (for testing) ==========

  public async sendRequest(request: WorkspaceProtocolRequest, timeoutMs: number = 15000): Promise<unknown> {
    if (!this._currentCid) {
      throw new Error('No active connection available. Please connect first.');
    }
    debugLog('WorkspaceService', '[WorkspaceService] sendRequest (raw):', JSON.stringify(request).substring(0, 200));
    const requestType = typeof request === 'string' ? request : Object.keys(request)[0];
    const expectedResponseTypes = this.getExpectedResponseTypes(requestType);

    const responsePromise = new Promise<unknown>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        eventEmitter.off('workspace:raw-response', handler);
        reject(new Error(`Request timed out after ${timeoutMs}ms waiting for response to ${requestType}`));
      }, timeoutMs);

      const handler = (response: unknown) => {
        if (response && typeof response === 'object') {
          const responseType = Object.keys(response)[0];
          if (expectedResponseTypes.includes(responseType) || responseType === 'Error') {
            clearTimeout(timeoutId);
            eventEmitter.off('workspace:raw-response', handler);
            resolve(response);
          }
        }
      };
      eventEmitter.on('workspace:raw-response', handler);
    });

    await websocketService.sendWorkspaceRequest(this._currentCid, request);
    return responsePromise;
  }

  private getExpectedResponseTypes(requestType: string): string[] {
    const mapping: Record<string, string[]> = {
      CreateNode: ['Node'], GetNode: ['Node'], UpdateNode: ['Node'],
      DeleteNode: ['NodeDeleted'], MoveNode: ['NodeMoved'],
      ListNodes: ['Nodes'], GetTreeStructure: ['TreeStructure'],
      GetTreeSchema: ['TreeSchema'], UpdateTreeSchema: ['TreeSchema', 'Success'],
      CreateNodeType: ['NodeTypes', 'Success'], ListNodeTypes: ['NodeTypes'],
      GetWorkspace: ['Workspace', 'WorkspaceNotInitialized'],
      ListWorkspaces: ['Workspaces'], CreateWorkspace: ['Workspace'],
      UpdateWorkspace: ['Workspace', 'Success'],
      AddMember: ['Member', 'Success'], RemoveMember: ['Success'],
      UpdateMemberRole: ['MemberRoleUpdated', 'Success'],
      ListMembers: ['Members'],
    };
    return mapping[requestType] || ['Success'];
  }
}
