/**
 * Responses that map directly to a generated protocol variant.
 *
 * Split from workspace-handlers so that file keeps the string and type-gap
 * responses, whose shapes are hand-maintained, and these stay together as
 * plain forwarding.
 */

import { eventEmitter } from '@/lib/event-emitter';
import { debugLog } from '@/lib/debug-config';
import { isVariant , type WorkspaceProtocolResponse } from 'citadel-workspace-client-ts';
import type { ConnectionInfo } from './workspace-handlers';
import { mapWasmMember } from './member-mapping';
import type { MappedMember } from '@/lib/workspace-response-handler/member-mapping';

export function handleGeneratedVariants(
  response: WorkspaceProtocolResponse,
  connectionInfo: ConnectionInfo,
): boolean {
  if (isVariant(response, 'Workspaces')) {
    // Handled, not forwarded. `workspaces:listed` had exactly one subscriber,
    // which wrote the list into `state.workspaces` -- a field nothing in the
    // tree ever read. The subscriber and the field are gone, so emitting to
    // nobody would just be the same dead weight with an extra hop; the guard
    // that flags an unheard emit is what caught it.
    //
    // Still returns true: the variant IS handled, and saying otherwise would
    // make a caller awaiting confirmation wait out its timeout.
    return true;
  }

  if (isVariant(response, 'Workspace')) {
    eventEmitter.emit('workspace:loaded', {
      workspace: {
        id: response.Workspace.id,
        name: response.Workspace.name,
        description: response.Workspace.description,
        metadata: response.Workspace.metadata || [],
      },
      connection: connectionInfo,
    });
    // Also raw, so a caller awaiting confirmation can see it.
    //
    // `Success` and `Error` emit this; the handled variants did not — they
    // returned true and the response ended there. So every write gated on THIS
    // variant waited out its 15s timeout and told the user "the change may not
    // have been saved", after the same handler had already applied it. The
    // action worked, and the app said it had not.
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  if (isVariant(response, 'Members')) {
    // The response now says WHICH domain it is about, and the payload carries
    // it through. Four subscribers each accepted any member list that arrived
    // and took last-writer-wins -- the sidebar, the admin members tab, the
    // user-search corpus and the group-call roster -- so a list fetched for one
    // domain rendered inside another, and the admin tab then sent role changes
    // naming ITS entity with users taken from somebody else's list.
    //
    // Tolerates the old shape (a bare array) so a client running against a
    // server that predates the field still works, with the domain unknown.
    const payload: { domain_id?: string | null; members: Record<string, unknown>[]; } | Record<string, unknown>[] = response.Members as
      | { domain_id?: string | null; members: Record<string, unknown>[] }
      | Record<string, unknown>[];
    const rawMembers: Record<string, unknown>[] = Array.isArray(payload) ? payload : payload.members;
    const domainId: string | undefined = Array.isArray(payload) ? undefined : payload.domain_id ?? undefined;

    eventEmitter.emit('members:loaded', {
      members: rawMembers.map((m) => mapWasmMember(m)),
      domainId,
      connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'Member')) {
    const mappedMember: MappedMember = mapWasmMember(response.Member as Record<string, unknown>);
    eventEmitter.emit('member:loaded', {
      member: mappedMember, connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'Success')) {
    eventEmitter.emit('operation:success', connectionInfo);
    if (response.Success.includes('deleted')) {
      eventEmitter.emit('operation:deleted', connectionInfo);
    }
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  if (isVariant(response, 'Error')) {
    eventEmitter.emit('operation:error', { message: response.Error, connection: connectionInfo });
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  if (isVariant(response, 'ServerShutdown')) {
    // Distinct from `Error` so the UI can show a reconnect notice rather
    // than a red toast on a planned restart.
    const { message, drain_seconds } = response.ServerShutdown;
    debugLog('WorkspaceResponseHandler', 'ServerShutdown received', {
      message,
      drain_seconds: drain_seconds.toString(),
    });
    eventEmitter.emit('server:shutdown', {
      message,
      drainSeconds: Number(drain_seconds),
      connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'UserPermissions')) {
    const { user_id, role, permissions, domain_id } = response.UserPermissions;
    debugLog('WorkspaceResponseHandler', 'UserPermissions received', { user_id, role, domain_id });
    eventEmitter.emit('user:permissions:loaded', {
      userId: user_id, role, permissions, domainId: domain_id, connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'MemberRoleUpdated')) {
    const { user_id, new_role } = response.MemberRoleUpdated;
    debugLog('WorkspaceResponseHandler', 'MemberRoleUpdated received', { user_id, new_role });
    eventEmitter.emit('member:role-updated', {
      userId: user_id, role: new_role, connection: connectionInfo,
    });
    // Also raw, so a caller awaiting confirmation can see it.
    //
    // `Success` and `Error` emit this; the handled variants did not — they
    // returned true and the response ended there. So every write gated on THIS
    // variant waited out its 15s timeout and told the user "the change may not
    // have been saved", after the same handler had already applied it. The
    // action worked, and the app said it had not.
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  if (isVariant(response, 'UserProfileUpdated')) {
    const user: Extract<WorkspaceProtocolResponse, { UserProfileUpdated: unknown }>['UserProfileUpdated'] = response.UserProfileUpdated;
    debugLog('WorkspaceResponseHandler', 'UserProfileUpdated received', {
      userId: user.id, name: user.name,
    });
    eventEmitter.emit('user:profile-updated', { user, connection: connectionInfo });
    // Raw as well, so a caller awaiting confirmation can see it. A handled
    // variant that returns true without this leaves every write gated on it
    // waiting out the 15s timeout and telling the user the change may not have
    // saved — after this handler already applied it.
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  if (isVariant(response, 'ServerCapabilities')) {
    const caps: { allow_server_file_transfer: boolean; allow_server_revfs_storage: boolean; max_file_transfer_size_mb: bigint; revfs_storage_quota_mb: bigint; } = response.ServerCapabilities;
    debugLog('WorkspaceResponseHandler', 'ServerCapabilities received', caps);
    eventEmitter.emit('server:capabilities:loaded', {
      allowServerFileTransfer: caps.allow_server_file_transfer,
      allowServerRevfsStorage: caps.allow_server_revfs_storage,
      maxFileTransferSizeMb: Number(caps.max_file_transfer_size_mb),
      revfsStorageQuotaMb: Number(caps.revfs_storage_quota_mb),
      connection: connectionInfo,
    });
    return true;
  }

  return false;
}
