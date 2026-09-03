import type { AvailablePeer } from './create-group-types';
/**
 * Types for GroupSettingsPanel component.
 */

import type { GroupConversation, GroupSettings as GroupSettingsType } from '@/types/group';

export interface GroupSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupConversation;
  /** Callback when group name is changed */
  onNameChange: (name: string) => Promise<void>;
  /** Callback when settings are changed */
  onSettingsChange: (settings: GroupSettingsType) => void;
  /** Callback when a member's role is changed */
  onMemberRoleChange: (memberCid: string, roleId: string) => Promise<void>;
  /** Callback when a member is kicked */
  onKickMember: (memberCid: string) => Promise<void>;
  /** Callback when the group is deleted */
  onDeleteGroup: () => Promise<void>;
  /** Peers who can still be invited. */
  invitablePeers?: AvailablePeer[];
  /** Callback when a peer is invited. Omit to hide the invite control. */
  onInviteMember?: (peerCid: string) => Promise<void>;
}
