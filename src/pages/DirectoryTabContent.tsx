/**
 * One tab of the user directory, including what it says when it has nobody.
 *
 * The list rendered zero rows and nothing else when empty, and the Online tab
 * is commonly empty — so the most likely first visit to this page showed a
 * blank panel with no explanation. The two reasons a tab can be empty need
 * different sentences, which is the whole content of this file.
 */

import { Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { MemberListItem, type MemberDisplay } from './MemberListItem';

interface DirectoryTabContentProps {
  tab: 'all' | 'online';
  members: MemberDisplay[];
  /** Every member, not just this tab's — "nobody online" and "nobody at all"
   *  are different states and only this distinguishes them. */
  totalMembers: number;
  onSendMessage: (userId: string) => void;
  onInvite: (userId: string) => void;
  onSelect: (userId: string) => void;
}

export function DirectoryTabContent({
  tab,
  members,
  totalMembers,
  onSendMessage,
  onInvite,
  onSelect,
}: DirectoryTabContentProps): JSX.Element {
  if (members.length === 0) {
    return (
      <div className="divide-y divide-border" data-testid="directory-member-list">
        <EmptyState
          icon={Users}
          title={tab === 'online' ? 'Nobody is online right now' : 'No members yet'}
          description={
            tab === 'online'
              ? totalMembers > 0
                ? 'Everyone in this workspace is currently offline. They will appear here when they connect.'
                : 'There is nobody in this workspace yet, so nobody can be online.'
              : 'Invite someone to this workspace and they will appear here.'
          }
        />
      </div>
    );
  }

  return (
    <div className="divide-y divide-border" data-testid="directory-member-list">
      {members.map((member) => (
        <MemberListItem
          key={member.id}
          member={member}
          variant={tab}
          onSendMessage={onSendMessage}
          onInvite={onInvite}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
