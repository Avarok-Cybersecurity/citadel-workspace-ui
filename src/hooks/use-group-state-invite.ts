/**
 * Group-Invite Acceptance Helper
 *
 * Pure async helper that builds a `GroupConversation` for an incoming
 * invite, including the inviter and (best-effort) the accepting user.
 *
 * Lives in its own module so the `useGroupState` hook stays under the
 * 250-line CI cap. The dynamic `connectionManager` import is preserved
 * here for the same reason it was in the original site: it keeps the
 * hook's synchronous import graph free of the connection module
 * (historical circular-dependency concern).
 */

import type { GroupConversation, GroupMember } from '@/types/group';
import { createDefaultRoles, getDefaultRole } from '@/types/group';
// Rendered directly rather than emitted as 'notification:show': that event had
// three emitters and no listener anywhere, so every one of these notices — the
// arrival notice AND both failure notices — was written to nobody. The comment
// at the group-store call site claimed this path "swallows its own failures with
// a user-facing toast"; the toast did not exist.
import { toast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debug-config';

export interface GroupInvitePayload {
  groupId: string;
  groupName: string;
  inviterId: string;
  inviterUsername: string;
}

/**
 * Parse a CID from the invite payload. Returns `null` if the input
 * is not a syntactically valid BigInt — this lets callers reject the
 * whole invite cleanly instead of letting `BigInt()` throw a
 * `SyntaxError` that bubbles out of the void-async wrapper in
 * `applyGroupInvite` as an unhandled rejection.
 */
function parseCid(raw: unknown): bigint | null {
  if (typeof raw === 'bigint') return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return BigInt(raw);
  if (typeof raw === 'string' && /^-?\d+$/.test(raw.trim())) {
    try {
      return BigInt(raw.trim());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Resolve the accepting user's CID and produce the local
 * `GroupConversation` entry for an incoming invite.
 *
 * Returns `null` for malformed payloads (missing fields, non-numeric
 * inviterId) — the caller logs and drops the invite. If the local CID
 * can't be resolved we still build the group (so the UI doesn't
 * silently swallow a valid invite) but the members array will contain
 * only the inviter — a later event can backfill self.
 *
 * Caller is responsible for committing the result via `setGroups` and
 * for emitting any user-facing notification.
 */
export async function buildGroupFromInvite(
  data: GroupInvitePayload,
): Promise<GroupConversation | null> {
  if (!data || !data.groupId || !data.inviterUsername) {
    debugLog('UseGroupConversations', 'Invalid invite payload (missing required field):', data);
    return null;
  }
  const inviterCid = parseCid(data.inviterId);
  if (inviterCid === null) {
    debugLog(
      'UseGroupConversations',
      'Invalid invite payload (inviterId not a valid CID):',
      data,
    );
    return null;
  }

  const defaultRoles = createDefaultRoles();
  const defaultRole = getDefaultRole({ roles: defaultRoles, defaultRoleId: '' });

  const inviterMember: GroupMember = {
    cid: inviterCid,
    username: data.inviterUsername,
    roleId: defaultRoles[0].id,
    joinedAt: Date.now(),
  };

  let selfMember: GroupMember | null = null;
  try {
    const { connectionManager } = await import('@/lib/connection');
    const info = connectionManager.getConnectionInfo();
    if (info) {
      const session = await connectionManager.getTabSelectedSession();
      const selfUsername = info.username || session?.username || 'me';
      selfMember = {
        cid: info.cid,
        username: selfUsername,
        roleId: defaultRole?.id || defaultRoles[defaultRoles.length - 1].id,
        joinedAt: Date.now(),
      };
    } else {
      debugLog(
        'UseGroupConversations',
        'No current connection info; group will be created without a self member',
      );
    }
  } catch (e) {
    debugLog('UseGroupConversations', 'Failed to resolve self for group invite:', e);
  }

  const members: GroupMember[] = selfMember
    ? [inviterMember, selfMember]
    : [inviterMember];

  return {
    id: data.groupId,
    name: data.groupName || `${data.inviterUsername}'s Group`,
    ownerId: inviterCid,
    members,
    settings: {
      roles: defaultRoles,
      // Same fallback pattern as the selfMember roleId above —
      // resolves to the lowest-privilege role regardless of how
      // many roles `createDefaultRoles()` returns. Hard-coding [2]
      // worked while there were exactly 3 default roles but would
      // silently yield `undefined` the day a role is added or
      // removed.
      defaultRoleId: defaultRole?.id || defaultRoles[defaultRoles.length - 1].id,
    },
    unreadCount: 1,
  };
}

/**
 * Convenience wrapper around `buildGroupFromInvite` that also fires the
 * standard "Group Invitation" notification. Callers pass in the
 * `setGroups` updater and we handle the dedupe-on-existing-id check.
 *
 * **Return contract:** returns `Promise<void>`. The inner try/catch
 * still swallows rejections so nothing escapes as an unhandled
 * rejection on the event loop *and* a user-facing notification
 * surfaces on failure — but the Promise return lets callers
 * optionally `await` or `.catch()` for extra context (e.g. routing
 * the failure into a retry queue, marking analytics) without
 * forcing every call site to learn the void-IIFE wrapper trick.
 * Most callers can `void applyGroupInvite(data, setGroups)` and
 * rely on the internal handler.
 *
 * **Known UX gap — local-only acceptance:** this commits local group
 * state without sending any backend-acknowledged
 * `AcceptGroupInvite` command. Today the Citadel group protocol does
 * not require explicit acceptance for outbound message sends, so the
 * optimistic local commit is correct for offline / peer-to-peer
 * routing. If that ever changes, a freshly-accepted invite will
 * appear "joined" in the UI while the server still treats the user
 * as merely invited — symptom to watch for is a permission /
 * membership error on the very first outbound chat send.
 *
 * Two concrete fix paths when the backend command lands:
 *   (a) preferred — make `applyGroupInvite` async, await
 *       `AcceptGroupInvite`, only call `setGroups` on success;
 *   (b) keep the optimistic local commit and reconcile on the
 *       `AcceptGroupInvite` response, showing a "pending acceptance"
 *       visual hint while the round-trip is in flight.
 */
export async function applyGroupInvite(
  data: GroupInvitePayload,
  setGroups: (updater: (prev: GroupConversation[]) => GroupConversation[]) => void,
): Promise<void> {
  try {
    const newGroup = await buildGroupFromInvite(data);
    if (!newGroup) {
      // Malformed payload — `buildGroupFromInvite` has already logged the why.
      return;
    }
    setGroups((prev) =>
      prev.some((g) => g.id === data.groupId) ? prev : [...prev, newGroup],
    );
    // The backend half of auto-accept. Without it the server keeps counting us
    // merely invited: the EnteredGroup broadcast that puts us on the creator's
    // member list never fires, their callable roster stays empty, and group
    // calls remain disabled. The local commit above stays optimistic; the
    // member-state broadcast this triggers is the reconciliation.
    try {
      const { sendGroupRespond } = await import(
        '@/lib/group-conversations/group-requests'
      );
      await sendGroupRespond(data.groupId, data.inviterId, true);
    } catch (e) {
      // The group still exists locally and P2P chat routing still works; what
      // is lost is server-side membership, which the settings panel's invite
      // path can re-establish. Losing the whole invite over it would be worse.
      debugLog('UseGroupConversations', 'Backend group acceptance failed:', e);
    }
    toast({
      title: 'Group Invitation',
      description: `${data.inviterUsername} invited you to "${data.groupName || 'a group'}"`,
    });
  } catch (e) {
    // The inviter / inviteUsername fields come straight from the
    // network event, so an unexpected throw most often means the
    // local connection state was unavailable when buildGroupFromInvite
    // tried to resolve self. Tell the user the invite was missed
    // (rather than letting it silently disappear) AND keep the debug
    // trace for the developer.
    debugLog('UseGroupConversations', 'applyGroupInvite failed:', e);
    toast({
      title: 'Group Invitation Failed',
      description: `Could not process invite from ${data.inviterUsername || 'a peer'}. Please try again.`,
      variant: 'destructive',
    });
  }
}
