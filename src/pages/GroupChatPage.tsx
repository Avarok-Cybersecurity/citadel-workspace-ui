/**
 * GroupChatPage Component
 *
 * Page for viewing and interacting with a custom peer group chat.
 *
 * Renders GroupChatView directly: it takes a groupId and does its own fetching.
 *
 * There used to be a ChatMessagingAdapter layer here, kept on the grounds that
 * it held the only implementation of edit, delete and reply. That stopped being
 * true -- both chats implement all three in their own hooks (useGroupChat via
 * WorkspaceService, useP2PCompose via the messenger) -- so the layer was two
 * copies of live logic behind a comment explaining why it could not be deleted.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRegisteredPeers } from '@/hooks/use-registered-peers';
import { GroupChatHeader } from '@/components/chat/GroupChatHeader';
import { GroupCallControls } from '@/components/call/GroupCallControls';
import { GroupCallDock } from '@/components/call/GroupCallDock';
import { GroupSettingsPanel } from '@/components/chat/GroupSettingsPanel';
import { GroupChatView } from '@/components/chat/GroupChatView';
import { useGroupConversations } from '@/hooks/use-group-conversations';
import type { GroupConversation, GroupSettings } from '@/types/group';
import { connectionManager } from '@/lib/connection';
import { sendGroupEnd } from '@/lib/group-conversations/group-requests';
import { debugLog } from '@/lib/debug-config';
import { AppLayout } from '@/components/layout/AppLayout';
import { groupGoneMessage } from '@/lib/group-conversations/group-gone-message';

// ============================================================================
// Component
// ============================================================================

export function GroupChatPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    getGroup,
    hydrated,
    markAsRead,
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
  const currentUserId: string = connectionInfo?.cid ? String(connectionInfo.cid) : '';
  const currentUserName: string = connectionInfo?.username || 'You';

  // Load group on mount
  useEffect(() => {
    if (!groupId) {
      navigate('/workspace');
      return;
    }

    // Nothing is knowable about a group until the restore has finished — see
    // `areGroupsHydrated`. Without this, every reload and shared link declared
    // the group deleted.
    if (!hydrated) return;

    const loadedGroup: GroupConversation | undefined = getGroup(groupId);
    if (!loadedGroup) {
      toast({ ...groupGoneMessage(groupId), variant: 'destructive' });
      navigate('/workspace');
      return;
    }

    setGroup(loadedGroup);
    // Opening the group IS reading it. `markAsRead` existed on the hook with
    // zero callers anywhere, so a group's unread badge could only ever climb —
    // there was no path back to zero short of a reload.
    markAsRead(groupId);
  }, [groupId, getGroup, hydrated, markAsRead, navigate, toast]);

  // Handlers
  const handleLeaveGroup: () => Promise<void> = useCallback(async (): Promise<void> => {
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
    const existing: Set<string> = new Set(group.members.map((m) => m.cid.toString()));
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

  const handleSettingsChange = useCallback((settings: GroupSettings): void => {
    setGroup(prev => (prev ? { ...prev, settings } : null));
  }, []);

  const handleNameChange = useCallback(
    async (name: string) => {
      setGroup(prev => (prev ? { ...prev, name } : null));
    },
    []
  );

  const handleDeleteGroup: () => Promise<void> = useCallback(async (): Promise<void> => {
    if (!groupId || !currentUserId) return;
    try {
      // Was `const client = getClient(); if (client) { ...send... }` — and a
      // follower tab owns no client, so the delete was skipped WITHOUT error
      // and the user was navigated away as though it had worked. The group
      // still existed, for everyone.
      await sendGroupEnd(groupId);
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
          <Loader2 className="h-8 w-8 animate-spin text-primary-accent" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background">
      {/* The route had no h1 at all, so heading navigation opened at level 2
          with no page title. Messages.tsx solved exactly this and the group
          route was missed. */}
      <h1 className="sr-only">Group chat</h1>

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
          {/* Keyed by group: useGroupChat never resets its composer, so a
              switch mid-draft carried inputValue, replyToId and editingId into
              the new group — and handleSendMessage pairs the STALE draft with
              the CURRENT groupId, delivering the message to the wrong group. */}
          <GroupChatView
            key={groupId}
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
