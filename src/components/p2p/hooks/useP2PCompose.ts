/**
 * Message composition state for P2PChat.
 *
 * Owns everything about the message being written: the input text and its
 * focus/typing signals, the message type, markdown formatting/preview, the
 * reply/edit compose context, the send flow, and the live-document creation
 * hand-off. Split from P2PChat.tsx (alongside useP2PMessages / useP2PTabs /
 * useP2PFileTransfer) so the component composes hooks instead of owning the
 * composer state machine itself.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
// No clearDraft here: every send path already does setInputMessage(''), and
// saveDraft treats an empty string as "no draft" and deletes the entry. A
// second way to clear it would be a second thing to keep in step with the first.
import { loadDraft, saveDraft } from '@/lib/chat/draft-store';
import { describeFailure } from '@/lib/failure-message';
import { P2PMessengerManager } from '@/lib/p2p/p2p-messenger-manager';
import type { P2PMessage } from '@/lib/p2p/p2p-types';
import { useToast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debug-config';
import { useMarkdownFormat } from '../MarkdownToolbar';
import type { MessageType } from '@/types/message-protocol';

interface UseP2PComposeParams {
  peerCid: bigint;
  messages: P2PMessage[];
  /** Commits an edit through the messages hook. */
  editMessage: (messageId: string, content: string) => Promise<void>;
  /** Creates a live document through the tabs hook. */
  createDocument: (title: string, initialContent: string) => Promise<void>;
}

export function useP2PCompose({ peerCid, messages, editMessage, createDocument }: UseP2PComposeParams) {
  // Seeded from the draft store, so switching conversations and coming back
  // returns what was typed. The chat is keyed by peer — that keying is the fix
  // for drafts LEAKING between conversations, and it is why the text has to
  // live outside the component to survive the remount.
  const conversationKey = peerCid?.toString() ?? '';
  const [inputMessage, setInputMessage] = useState(() => loadDraft(conversationKey));
  // True between submit and the message appearing in the transcript. The group
  // composer has had this guard since it was written; the P2P one never did, so
  // a second Enter during the send window sent a genuine duplicate.
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputMessageRef = useRef(inputMessage);

  const [messageType, setMessageType] = useState<MessageType>('text');
  const [showDocModal, setShowDocModal] = useState(false);
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);

  const { toast } = useToast();
  const messenger = P2PMessengerManager.getInstance();
  const applyFormat = useMarkdownFormat(inputRef, setInputMessage, () => inputMessage);

  useEffect(() => { inputMessageRef.current = inputMessage; }, [inputMessage]);

  // Written on every change rather than on unmount: a tab close, a crash or a
  // navigation that skips cleanup all lose an unmount-only save, and those are
  // exactly the moments a draft matters.
  useEffect(() => {
    saveDraft(conversationKey, inputMessage);
  }, [conversationKey, inputMessage]);

  // The message this composition is replying to, if any. Cleared on send and on
  // explicit cancel, so a reply cannot silently attach itself to a later message.
  const [replyingTo, setReplyingTo] = useState<P2PMessage | null>(null);

  // The message being edited. The bubble's Edit action hands us the CURRENT
  // content, so it cannot be an edit on its own — it loads the message into the
  // composer and the next submit commits the change.
  const [editingMessage, setEditingMessage] = useState<P2PMessage | null>(null);

  const handleReplyMessage = useCallback((messageId: string) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target) return;
    setEditingMessage(null);
    setReplyingTo(target);
    inputRef.current?.focus();
  }, [messages]);

  const handleStartEdit = useCallback((messageId: string, content: string) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target) return;
    setReplyingTo(null);
    setEditingMessage(target);
    setInputMessage(content);
    inputRef.current?.focus();
  }, [messages]);

  const cancelComposeContext = useCallback(() => {
    if (editingMessage) setInputMessage('');
    setEditingMessage(null);
    setReplyingTo(null);
  }, [editingMessage]);

  const handleSendMessage = async () => {
    if (isSending) return;
    if (!inputMessage.trim()) return;
    if (messageType === 'live_document') { setShowDocModal(true); return; }
    messenger.stopTypingPolling(peerCid);
    setIsSending(true);
    try {
      if (editingMessage) {
        await editMessage(editingMessage.id, inputMessage);
        setEditingMessage(null);
        setInputMessage('');
        return;
      }
      await messenger.sendMessage(peerCid, inputMessage, {
        messageType,
        replyTo: replyingTo?.id,
        // Clears the composer the moment the bubble exists, rather than when
        // the network round trip finishes. Failures BEFORE that point leave
        // no bubble to retry from, so the text has to survive them.
        onOptimisticAppend: () => {
          setInputMessage('');
          setReplyingTo(null);
          setIsSending(false);
        },
      });
    } catch (error) {
      debugLog('P2PChat', 'Failed to send message:', error);
      toast({ variant: 'destructive', title: 'Failed to send message', description: describeFailure(error, 'Check your connection and try again.') });
    } finally {
      setIsSending(false);
    }
  };


  const handleDocCreate = useCallback(async (title: string, initialContent: string) => {
    await createDocument(title, initialContent);
    setShowDocModal(false);
    setInputMessage('');
  }, [createDocument]);

  const handleMessageTypeChange = useCallback((type: MessageType) => {
    setMessageType(type);
    if (type === 'live_document' && inputMessage.trim()) setShowDocModal(true);
  }, [inputMessage]);

  const handleInputFocus = useCallback(() => {
    if (peerCid) messenger.startTypingPolling(peerCid, () => inputMessageRef.current);
  }, [peerCid, messenger]);

  const handleInputBlur = useCallback(() => {
    if (peerCid) messenger.stopTypingPolling(peerCid);
  }, [peerCid, messenger]);

  return {
    inputRef, inputMessage, setInputMessage, isSending,
    messageType, showDocModal, setShowDocModal,
    showMarkdownPreview, setShowMarkdownPreview,
    applyFormat,
    replyingTo, editingMessage,
    handleReplyMessage, handleStartEdit, cancelComposeContext,
    handleSendMessage, handleDocCreate, handleMessageTypeChange,
    handleInputFocus, handleInputBlur,
  };
}
