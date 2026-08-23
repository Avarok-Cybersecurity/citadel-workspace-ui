/**
 * GroupChatPage Component
 *
 * Page for viewing and interacting with a custom peer group chat.
 * Uses GroupChatView with the real GroupMessagingAdapter for backend-connected messaging.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { GroupChatHeader } from '@/components/chat/GroupChatHeader';
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
  } = useGroupConversations();

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
          group_key: groupId,
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
        <div className="flex items-center justify-center h-full bg-[#1C1D28]">
          <Loader2 className="h-8 w-8 animate-spin text-[#6E59A5]" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-[#1C1D28]">

      {/* Header */}
      <GroupChatHeader
        group={group}
        onOpenSettings={() => setShowSettings(true)}
        onLeaveGroup={handleLeaveGroup}
      />

      {/* Real group chat with backend messaging */}
      {currentUserId && groupId && (
        <GroupChatView
          groupId={groupId}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          totalMembers={group.members.length}
        />
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
        onDeleteGroup={handleDeleteGroup}
      />
      </div>
    </AppLayout>
  );
}

export default GroupChatPage;
