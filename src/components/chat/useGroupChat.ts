import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { GroupMessage } from '@/types/workspace-entities';
import { GroupMessageTypeTS } from '@/types/workspace-protocol';
import WorkspaceService from '@/lib/workspace-service';
import { groupMessagingManager } from '@/lib/group-messaging-manager';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { groupMessagesByDate } from './shared';
import { debugLog } from '@/lib/debug-config';

export function useGroupChat(groupId: string) {
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);

  const [inputValue, setInputValue] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Load initial messages
  useEffect(() => {
    const loadMessages = async () => {
      setLoading(true);
      try {
        await WorkspaceService.getGroupMessages(groupId);
      } catch (error) {
        debugLog('GroupChatView', 'Failed to load messages:', error);
        toast({
          title: 'Failed to load messages',
          description: 'Please try again later.',
          variant: 'destructive',
        });
      }
    };

    runAsyncSetup(loadMessages);
  }, [groupId, toast]);

  // Subscribe to group message events
  useEffect(() => {
    const unsubscribe = groupMessagingManager.subscribeToGroup(groupId, (event) => {
      switch (event.type) {
        case 'messages_loaded':
          setMessages(event.messages || []);
          setHasMore(event.hasMore || false);
          setLoading(false);
          setLoadingMore(false);
          break;
        case 'new_message': {
          const newMsg = event.message;
          if (newMsg) {
            setMessages((prev) => {
              const exists = prev.some((m) => m.id === newMsg.id);
              if (exists) {
                debugLog('GroupChatView', 'Skipping duplicate message:', newMsg.id);
                return prev;
              }
              return [...prev, newMsg];
            });
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }
          break;
        }
        case 'message_edited':
          setMessages((prev) =>
            prev.map((m) =>
              m.id === event.messageId
                ? { ...m, content: event.message?.content || m.content, edited_at: event.message?.edited_at ?? m.edited_at }
                : m
            )
          );
          break;
        case 'message_deleted':
          setMessages((prev) => prev.filter((m) => m.id !== event.messageId));
          break;
      }
    });

    return () => unsubscribe();
  }, [groupId]);

  // Load more messages (pagination)
  const loadMoreMessages = useCallback(async () => {
    if (!hasMore || loadingMore) return;

    const oldestTimestamp = groupMessagingManager.getOldestTimestamp(groupId);
    if (!oldestTimestamp) return;

    setLoadingMore(true);
    try {
      await WorkspaceService.getGroupMessages(groupId, oldestTimestamp);
    } catch (error) {
      debugLog('GroupChatView', 'Failed to load more messages:', error);
      setLoadingMore(false);
    }
  }, [groupId, hasMore, loadingMore]);

  // Handle send message
  const handleSendMessage = async () => {
    if (!inputValue.trim() || sending) return;

    setSending(true);
    try {
      await WorkspaceService.sendGroupMessage(
        groupId,
        inputValue.trim(),
        GroupMessageTypeTS.Text,
        replyToId || undefined
      );
      setInputValue('');
      setReplyToId(null);
    } catch (error) {
      debugLog('GroupChatView', 'Failed to send message:', error);
      toast({
        title: 'Failed to send message',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  // Handle edit message
  const handleEditMessage = async () => {
    if (!editingId || !editContent.trim()) return;

    try {
      await WorkspaceService.editGroupMessage(groupId, editingId, editContent.trim());
      setEditingId(null);
      setEditContent('');
    } catch (error) {
      debugLog('GroupChatView', 'Failed to edit message:', error);
      toast({
        title: 'Failed to edit message',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle delete message
  const handleDeleteMessage = async (messageId: string) => {
    try {
      await WorkspaceService.deleteGroupMessage(groupId, messageId);
    } catch (error) {
      debugLog('GroupChatView', 'Failed to delete message:', error);
      toast({
        title: 'Failed to delete message',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const messagesByDate = groupMessagesByDate(messages);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runAsyncSetup(async () => {
        if (editingId) {
          await handleEditMessage();
        } else {
          await handleSendMessage();
        }
      });
    }
  };

  return {
    scrollAreaRef, messagesEndRef,
    messages, hasMore, loading, loadingMore, sending,
    inputValue, setInputValue,
    replyToId, setReplyToId,
    editingId, setEditingId,
    editContent, setEditContent,
    loadMoreMessages, handleSendMessage, handleEditMessage, handleDeleteMessage,
    messagesByDate, handleKeyPress,
  };
}
