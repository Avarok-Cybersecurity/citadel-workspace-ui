import { useState, useEffect, useMemo, useRef, useCallback , type RefObject  } from 'react';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { DELETE_MESSAGE_PROMPT } from '@/lib/chat/delete-message-prompt';
import { describeFailure } from '@/lib/failure-message';
import { useToast } from '@/hooks/use-toast';
import { shouldSendOnKey } from './should-send-on-key';
import type { GroupMessage } from '@/types/workspace-entities';
import { GroupMessageTypeTS } from '@/types/workspace-protocol';
import WorkspaceService from '@/lib/workspace-service';
import { groupMessagingManager } from '@/lib/group-messaging-manager';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { groupMessagesByDate } from './shared';
import { debugLog } from '@/lib/debug-config';
import { armLoadingDeadline, cancelLoadingDeadline } from '@/lib/loading-flag-timeout';
import type { Dispatch, SetStateAction } from 'react';

export function useGroupChat(groupId: string): { scrollAreaRef: RefObject<HTMLDivElement>; messagesEndRef: RefObject<HTMLDivElement>; messages: GroupMessage[]; hasMore: boolean; loading: boolean; loadingMore: boolean; sending: boolean; inputValue: string; setInputValue: Dispatch<SetStateAction<string>>; replyToId: string | null; setReplyToId: Dispatch<SetStateAction<string | null>>; editingId: string | null; setEditingId: Dispatch<SetStateAction<string | null>>; editContent: string; setEditContent: Dispatch<SetStateAction<string>>; loadMoreMessages: () => Promise<void>; handleSendMessage: () => Promise<void>; handleEditMessage: () => Promise<void>; handleDeleteMessage: (messageId: string) => Promise<void>; messagesByDate: Record<string, GroupMessage[]>; handleKeyPress: (e: React.KeyboardEvent) => void; } {
  const { toast } = useToast();
  const confirm: ReturnType<typeof useConfirm> = useConfirm();
  const scrollAreaRef: RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
  const messagesEndRef: RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);

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
    const loadMessages = async (): Promise<void> => {
      setLoading(true);
      // getGroupMessages resolves when the request is SENT, and `loading` is
      // cleared only by the messages_loaded event — so a refused or lost
      // response left the view spinning forever with nothing to press. The only
      // escape was navigating away or reloading.
      //
      // Falling back to the empty state is honest: "no messages yet" is at
      // least a statement the user can act on, where an unresolvable spinner is
      // not.
      armLoadingDeadline(`group-messages:${groupId}`, () => setLoading(false));
      try {
        await WorkspaceService.getGroupMessages(groupId);
      } catch (error) {
        debugLog('GroupChatView', 'Failed to load messages:', error);
        toast({
          title: 'Failed to load messages',
          description: describeFailure(error, 'Please try again later.'),
          variant: 'destructive',
        });
      }
    };

    runAsyncSetup(loadMessages);
  }, [groupId, toast]);

  // Subscribe to group message events
  useEffect(() => {
    const unsubscribe: () => void = groupMessagingManager.subscribeToGroup(groupId, (event): void => {
      switch (event.type) {
        case 'messages_loaded':
          cancelLoadingDeadline(`group-messages:${groupId}`);
          cancelLoadingDeadline(`group-messages-more:${groupId}`);
          setMessages(event.messages || []);
          setHasMore(event.hasMore || false);
          setLoading(false);
          setLoadingMore(false);
          break;
        case 'new_message': {
          const newMsg: GroupMessage | undefined = event.message;
          if (newMsg) {
            setMessages((prev) => {
              const exists: boolean = prev.some((m): boolean => m.id === newMsg.id);
              if (exists) {
                debugLog('GroupChatView', 'Skipping duplicate message:', newMsg.id);
                return prev;
              }
              return [...prev, newMsg];
            });
            setTimeout(() => {
              // An explicit `behavior` in ScrollIntoViewOptions beats the
              // `scroll-behavior: auto !important` that index.css sets under
              // prefers-reduced-motion, so the media query has to be read here.
              const reduced: boolean = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              messagesEndRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
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

    return (): void => unsubscribe();
  }, [groupId]);

  // Load more messages (pagination)
  const loadMoreMessages: () => Promise<void> = useCallback(async (): Promise<void> => {
    if (!hasMore || loadingMore) return;

    const oldestTimestamp: bigint | undefined = groupMessagingManager.getOldestTimestamp(groupId);
    if (!oldestTimestamp) return;

    setLoadingMore(true);
    // Same shape, worse symptom: the "Load older messages" button is
    // `disabled={loadingMore}`, so a lost response disabled it permanently.
    armLoadingDeadline(`group-messages-more:${groupId}`, () => setLoadingMore(false));
    // Tell the manager an older page is coming, so it merges rather than
    // replacing the thread. Without this the response looked identical to an
    // initial load and took the "replace" branch.
    groupMessagingManager.markLoadingOlder(groupId);
    try {
      await WorkspaceService.getGroupMessages(groupId, oldestTimestamp);
    } catch (error) {
      debugLog('GroupChatView', 'Failed to load more messages:', error);
      groupMessagingManager.clearLoadingOlder(groupId);
      setLoadingMore(false);
    }
  }, [groupId, hasMore, loadingMore]);

  // Handle send message
  const handleSendMessage = async (): Promise<void> => {
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
        description: describeFailure(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  // Handle edit message
  const handleEditMessage = async (): Promise<void> => {
    if (!editingId || !editContent.trim()) return;

    try {
      await WorkspaceService.editGroupMessage(groupId, editingId, editContent.trim());
      setEditingId(null);
      setEditContent('');
    } catch (error) {
      debugLog('GroupChatView', 'Failed to edit message:', error);
      toast({
        title: 'Failed to edit message',
        description: describeFailure(error, 'Please try again.'),
        variant: 'destructive',
      });
    }
  };

  // Handle delete message
  const handleDeleteMessage = async (messageId: string): Promise<void> => {
    // Asked first. Delete sits directly under Edit in the same dropdown, and a
    // mis-click destroyed the message for everyone with no undo.
    if (!(await confirm(DELETE_MESSAGE_PROMPT))) return;

    try {
      await WorkspaceService.deleteGroupMessage(groupId, messageId);
    } catch (error) {
      debugLog('GroupChatView', 'Failed to delete message:', error);
      toast({
        title: 'Failed to delete message',
        description: describeFailure(error, 'Please try again.'),
        variant: 'destructive',
      });
    }
  };

  // `inputValue` lives in this hook, so without the memo the entire thread was
  // regrouped on every keystroke — and `formatDate` builds three Date objects
  // per message. A long thread made typing visibly lag.
  const messagesByDate: Record<string, GroupMessage[]> = useMemo(() => groupMessagesByDate(messages), [messages]);

  const handleKeyPress = (e: React.KeyboardEvent): void => {
    if (shouldSendOnKey(e)) {
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
