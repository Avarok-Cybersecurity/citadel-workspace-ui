/**
 * GroupChatPage Component
 *
 * Page for viewing and interacting with a custom peer group chat.
 *
 * Renders GroupChatView directly. It does NOT use GroupMessagingAdapter, despite
 * what this comment used to say — GroupChatView takes a groupId and does its own
 * fetching, and nothing in the app constructs an adapter. See the note at the top
 * of lib/chat-messaging-adapter.ts.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { groupIdToKey } from '@/lib/group-conversations/group-key';
import { useRegisteredPeers } from '@/hooks/use-registered-peers';
import { GroupChatHeader } from '@/components/chat/GroupChatHeader';
import { GroupCallControls } from '@/components/call/GroupCallControls';
import { GroupCallDock } from '@/components/call/GroupCallDock';
import { GroupSettingsPanel } from '@/components/chat/GroupSettingsPanel';
import { GroupChatView } from '@/components/chat/GroupChatView';
import { useGroupConversations } from '@/hooks/use-group-conversations';
import type { GroupConversation, GroupSettings } from '@/types/group';
import { connectionManager } from '@/lib/connection';
import { websocketService } from '@/lib/websocket-service';
import { toInternalServiceRequest } from '@/hooks/use-group-conversations.types';
import { debugLog } from '@/lib/debug-config';
import { AppLayout } from '@/components/layout/AppLayout';

// ============================================================================
// Component
// ============================================================================

export function GroupChatPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    getGroup,
    leaveGroup,
    kickMember,
    updateMemberRole,
    invitePeer,
  } = useGroupConversations();
  const { registeredPeers } = useRegisteredPeers();

  // State
  const [group, setGroup] = useState<GroupConversation | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Get current user info
  const connectionInfo = connectionManager.getConnectionInfo();
  const currentUserId = connectionInfo?.cid ? String(connectionInfo.cid) : '';
  const currentUserName = connectionInfo?.username || 'You';

  // Load group on mount
  useEffect(() => {
    if (!groupId) {
      navigate('/workspace');
      return;
    }

    const loadedGroup = getGroup(groupId);
    if (!loadedGroup) {
      toast({
        title: 'Group not found',
        description: 'This group may have been deleted.',
        variant: 'destructive',
      });
      navigate('/workspace');
      return;
    }

    setGroup(loadedGroup);
  }, [groupId, getGroup, navigate, toast]);

  // Handlers
  const handleLeaveGroup = useCallback(async () => {
    if (!groupId) return;
    await leaveGroup(groupId);
    navigate('/workspace');
  }, [groupId, leaveGroup, navigate]);

  const handleKickMember = useCallback(
    async (memberCid: string) => {
      if (!groupId) return;
      await kickMember(groupId, memberCid);
    },
    [groupId, kickMember]
  );

  const handleRoleChange = useCallback(
    async (memberCid: string, roleId: string) => {
      if (!groupId) return;
      await updateMemberRole(groupId, memberCid, roleId);
    },
    [groupId, updateMemberRole]
  );

  // Everyone except the current user — startCall invites this exact list, so
  // including ourselves would make the engine ring us in our own call.
  const callMembers = useMemo(() => {
    if (!group) return [];
    return group.members
      .filter((m) => m.cid.toString() !== currentUserId)
      .map((m) => ({ cid: m.cid, username: m.username }));
  }, [group, currentUserId]);

  // Anyone already in the group would be a no-op invite, so they are filtered
  // out rather than offered and silently rejected by the backend.
  const invitablePeers = useMemo(() => {
    if (!group) return [];
    const existing = new Set(group.members.map((m) => m.cid.toString()));
    return registeredPeers.filter((p) => !existing.has(p.cid));
  }, [group, registeredPeers]);

  const handleInviteMember = useCallback(
    async (peerCid: string) => {
      if (!groupId) return;
      try {
        await invitePeer(groupId, peerCid);
        toast({ title: 'Invitation sent' });
      } catch (error) {
        toast({
          title: 'Failed to invite',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [groupId, invitePeer, toast],
  );

  const handleSettingsChange = useCallback((settings: GroupSettings) => {
    setGroup(prev => (prev ? { ...prev, settings } : null));
  }, []);

  const handleNameChange = useCallback(
    async (name: string) => {
      setGroup(prev => (prev ? { ...prev, name } : null));
    },
    []
  );

  const handleDeleteGroup = useCallback(async () => {
    if (!groupId || !currentUserId) return;
    try {
      const request = {
        GroupEnd: {
          cid: BigInt(currentUserId),
          group_key: groupIdToKey(groupId),
          request_id: crypto.randomUUID(),
        },
      };

      const client = websocketService.getClient();
      if (client) {
        await client.sendDirectToInternalService(toInternalServiceRequest(request));
      }
      navigate('/workspace');
    } catch (error) {
      debugLog('GroupChatPage', 'Failed to delete group:', error);
      toast({
        title: 'Failed to delete group',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [groupId, currentUserId, navigate, toast]);

  if (!group) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background">

      {/* Header */}
      <GroupChatHeader
        group={group}
        onOpenSettings={() => setShowSettings(true)}
        onLeaveGroup={handleLeaveGroup}
        callControls={
          <GroupCallControls roomId={group.id} roomName={group.name} members={callMembers} />
        }
      />

      {/* Docked above the messages, scoped to this group's call and no other. */}
      <GroupCallDock roomId={group.id} />

      {/* Real group chat with backend messaging. The wrapper gives the
          h-full chat view a bounded flex slot, so a docked call stage
          shrinks the messages instead of pushing the composer off-screen. */}
      {currentUserId && groupId && (
        <div className="flex-1 min-h-0">
          <GroupChatView
            groupId={groupId}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            totalMembers={group.members.length}
          />
        </div>
      )}

      {/* Settings Panel */}
      <GroupSettingsPanel
        open={showSettings}
        onOpenChange={setShowSettings}
        group={group}
        onNameChange={handleNameChange}
        onSettingsChange={handleSettingsChange}
        onMemberRoleChange={handleRoleChange}
        onKickMember={handleKickMember}
        invitablePeers={invitablePeers}
        onInviteMember={handleInviteMember}
        onDeleteGroup={handleDeleteGroup}
      />
      </div>
    </AppLayout>
  );
}

export default GroupChatPage;
