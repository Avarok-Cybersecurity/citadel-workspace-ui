/**
 * GroupChatPage Component
 *
 * Page for viewing and interacting with a custom peer group chat.
 * Uses P2P messaging infrastructure for group communication.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { GroupChatHeader } from '@/components/chat/GroupChatHeader';
import { GroupSettingsPanel } from '@/components/chat/GroupSettingsPanel';
import { GroupMessageList } from './GroupMessageList';
import { useGroupConversations } from '@/hooks/use-group-conversations';
import type { GroupConversation, GroupSettings, GroupMessage } from '@/types/group';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { useGroupChatEvents } from './useGroupChatEvents';
import { Send, Loader2 } from 'lucide-react';

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
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);

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

  // Listen for group updates, deletions, and incoming messages
  useGroupChatEvents({ groupId, getGroup, setGroup, setMessages });

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
    // @human-review Group deletion requires backend GroupEnd API integration
    navigate('/workspace');
  }, [navigate]);

  const handleSendMessage = useCallback(async () => {
    if (!messageInput.trim() || !groupId || isSending) return;

    setIsSending(true);
    try {
      const connectionInfo = (await import("./../lib/connection")).connectionManager.getConnectionInfo(); const cid = connectionInfo?.cid || null;
      if (!cid) throw new Error('Not connected');

      // @human-review Group messaging requires backend GroupMessage API integration
      // Currently adds messages locally only
      const newMessage: GroupMessage = {
        id: crypto.randomUUID(),
        groupId,
        senderId: cid,
        senderName: 'You',
        messageType: 'Text',
        content: messageInput.trim(),
        timestamp: Date.now(),
        replyCount: 0,
        mentions: [],
      };
      setMessages(prev => [...prev, newMessage]);
      setMessageInput('');
    } catch (error) {
      toast({
        title: 'Failed to send message',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  }, [messageInput, groupId, isSending, toast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        runAsyncSetup(handleSendMessage);
      }
    },
    [handleSendMessage]
  );

  if (!group) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1C2333]">
        <Loader2 className="h-8 w-8 animate-spin text-[#6E59A5]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#1C2333]">
      {/* Back Button */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#2D3548]">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/workspace')}
          className="h-8 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      {/* Header */}
      <GroupChatHeader
        group={group}
        onOpenSettings={() => setShowSettings(true)}
        onLeaveGroup={handleLeaveGroup}
      />

      {/* Messages Area */}
      <GroupMessageList messages={messages} />

      {/* Message Input */}
      <div className="p-4 border-t border-[#2D3548]">
        <div className="flex items-end gap-2">
          <Textarea
            placeholder="Type a message..."
            value={messageInput}
            onChange={e => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="flex-1 min-h-[40px] max-h-[120px] bg-[#262C4A] border-[#3D4663] text-white resize-none"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || isSending}
            className="h-10 bg-[#6E59A5] hover:bg-[#5D4A94] text-white"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

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
  );
}

export default GroupChatPage;
