/**
 * Custom hook for GroupChatPage event handling.
 * Manages group update, deletion, and message events.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { eventEmitter } from '@/lib/event-emitter';
import { ensureBigInt } from '@/lib/utils';
import type { GroupConversation, GroupMessage } from '@/types/group';

interface UseGroupChatEventsParams {
  groupId: string | undefined;
  getGroup: (id: string) => GroupConversation | undefined;
  setGroup: React.Dispatch<React.SetStateAction<GroupConversation | null>>;
  setMessages: React.Dispatch<React.SetStateAction<GroupMessage[]>>;
}

export function useGroupChatEvents({
  groupId,
  getGroup,
  setGroup,
  setMessages,
}: UseGroupChatEventsParams) {
  const navigate = useNavigate();
  const { toast } = useToast();

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
  }, [groupId, getGroup, navigate, toast, setGroup, setMessages]);
}
