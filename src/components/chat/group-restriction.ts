/**
 * Why something in a group is unavailable — a decision, or an absence.
 *
 * When the `sendMessages` and `viewMemberList` switches were wired up, the
 * denial they produced came from `useGroupPermissions`' "No role = no
 * permissions" branch. That branch answers false to two quite different
 * questions at once:
 *
 *   - you hold a role, and it does not permit this; and
 *   - you are not in this group's member list at all.
 *
 * The second happens for real. `buildGroupFromInvite` adds the accepting user
 * on a best-effort basis and its own docstring says the members array may
 * "contain only the inviter". Such a user was then told "Your role in this
 * group cannot send messages", naming a role they do not have and offering
 * nothing to do about it.
 *
 * Same shape as the presence dot one directory over: an absence rendered as a
 * decision. Three answers, so the UI can say which.
 */
export type GroupRestriction = 'allowed' | 'denied-by-role' | 'not-listed';

export function groupRestriction(listedAsMember: boolean, allowed: boolean): GroupRestriction {
  if (allowed) return 'allowed';
  return listedAsMember ? 'denied-by-role' : 'not-listed';
}

/** What to tell someone who cannot do `action` here. Null when they can. */
export function restrictionText(restriction: GroupRestriction, action: string): string | null {
  switch (restriction) {
    case 'allowed':
      return null;
    case 'denied-by-role':
      return `You do not have permission to ${action} here.`;
    case 'not-listed':
      return `You are not listed as a member of this group yet, so you cannot ${action}.`;
  }
}
