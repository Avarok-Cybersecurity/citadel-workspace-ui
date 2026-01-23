/**
 * GroupChatPage Component
 *
 * Page for viewing and interacting with a custom peer group chat.
 * Uses P2P messaging infrastructure for group communication.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { GroupChatHeader } from '@/components/chat/GroupChatHeader';
import { GroupSettingsPanel } from '@/components/chat/GroupSettingsPanel';
import { useGroupConversations } from '@/hooks/use-group-conversations';
import type { GroupConversation, GroupSettings, GroupMessage } from '@/types/group';
import { websocketService } from '@/lib/websocket-service';
import { eventEmitter } from '@/lib/event-emitter';
import { ensureBigInt } from '@/lib/utils';
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

  // Listen for group updates
  useEffect(() => {
    if (!groupId) return;

    const handleGroupUpdate = () => {
      const updatedGroup = getGroup(groupId);
      if (updatedGroup) {
        setGroup(updatedGroup);
      }
    };

    const handleGroupDeleted = (data: { groupId: string }) => {
      if (data.groupId === groupId) {
        toast({
          title: 'Group deleted',
          description: 'This group has been deleted.',
        });
        navigate('/workspace');
      }
    };

    const handleMessageReceived = (data: {
      groupId: string;
      senderId: bigint | string;
      senderName: string;
      content: string;
    }) => {
      if (data.groupId === groupId) {
        const newMessage: GroupMessage = {
          id: crypto.randomUUID(),
          groupId: data.groupId,
          senderId: ensureBigInt(data.senderId),
          senderName: data.senderName,
          messageType: 'Text',
          content: data.content,
          timestamp: Date.now(),
          replyCount: 0,
          mentions: [],
        };
        setMessages(prev => [...prev, newMessage]);
      }
    };

    eventEmitter.on('group:member-joined', handleGroupUpdate);
    eventEmitter.on('group:member-left', handleGroupUpdate);
    eventEmitter.on('group:member-kicked', handleGroupUpdate);
    eventEmitter.on('group:deleted', handleGroupDeleted);
    eventEmitter.on('group:message-received', handleMessageReceived);

    return () => {
      eventEmitter.off('group:member-joined', handleGroupUpdate);
      eventEmitter.off('group:member-left', handleGroupUpdate);
      eventEmitter.off('group:member-kicked', handleGroupUpdate);
      eventEmitter.off('group:deleted', handleGroupDeleted);
      eventEmitter.off('group:message-received', handleMessageReceived);
    };
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
    // TODO: Implement group deletion via backend
    navigate('/workspace');
  }, [navigate]);

  const handleSendMessage = useCallback(async () => {
    if (!messageInput.trim() || !groupId || isSending) return;

    setIsSending(true);
    try {
      const connectionInfo = (await import("./../lib/connection-manager")).connectionManager.getConnectionInfo(); const cid = connectionInfo?.cid || null;
      if (!cid) throw new Error('Not connected');

      // TODO: Send via backend GroupMessage API
      // For now, add locally as demo
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
        (async () => {
          await handleSendMessage();
        })().catch(console.error);
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
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map(message => (
              <div
                key={message.id}
                className="flex items-start gap-3 group"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white bg-[#6E59A5]"
                >
                  {message.senderName[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">
                      {message.senderName}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{message.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

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
