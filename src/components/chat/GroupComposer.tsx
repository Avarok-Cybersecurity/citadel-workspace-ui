/**
 * A group chat's composer: the box, its send button and the type bar.
 *
 * In an office or room chat it also shares a live document. That works with the box empty (the
 * document is then untitled) and with the box holding its title, and Enter does it too: in
 * that mode the box is a title, never a message.
 */
import React, { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TypeSelectorBar } from '@/components/p2p/TypeSelectorBar';
import type { MessageType } from '@/types/message-protocol';
import { useToast } from '@/hooks/use-toast';
import { describeFailure } from '@/lib/failure-message';
import { groupSendTransport } from '@/lib/group-conversations/group-send-transport';
import { GroupAttachButton } from './GroupAttachButton';
import { GROUP_COMPOSE_TYPES, NODE_CHAT_COMPOSE_TYPES, toComposeType, toMemberType } from './group-compose-types';
import { shouldSendOnKey } from './should-send-on-key';
import type { useGroupChat } from './useGroupChat';
import type { GroupLiveDocs } from './live-doc/use-group-live-docs';

interface GroupComposerProps {
  groupId: string;
  chat: ReturnType<typeof useGroupChat>;
  liveDocs: GroupLiveDocs;
  composerRef: React.RefObject<HTMLTextAreaElement>;
}

function placeholderFor(editing: boolean, liveDoc: boolean, markdown: boolean): string {
  if (editing) return 'Edit message...';
  if (liveDoc) return 'Document title (optional)';
  return markdown ? 'Write Markdown…' : 'Type a message...';
}

export function GroupComposer({ groupId, chat, liveDocs, composerRef }: GroupComposerProps): JSX.Element {
  const { toast } = useToast();
  const peer: boolean = groupSendTransport(groupId) === 'peer';
  const [liveDoc, setLiveDoc] = useState<boolean>(false);
  const [sharing, setSharing] = useState<boolean>(false);
  const editing: boolean = Boolean(chat.editingId);
  const sharingDoc: boolean = liveDoc && !editing;

  const shareDoc = async (): Promise<void> => {
    if (sharing) return;
    setSharing(true);
    try {
      await liveDocs.share(chat.inputValue);
      chat.setInputValue('');
    } catch (error) {
      toast({ title: 'The document was not shared', description: describeFailure(error, 'Please try again.'), variant: 'destructive' });
    } finally {
      setSharing(false);
    }
  };
  const send = (): void => { const _: Promise<void> = sharingDoc ? shareDoc() : editing ? chat.handleEditMessage() : chat.handleSendMessage(); };
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!sharingDoc) { chat.handleKeyPress(e); return; }
    if (shouldSendOnKey(e)) { e.preventDefault(); send(); }
  };
  const busy: boolean = chat.sending || sharing;
  const empty: boolean = editing ? !chat.editContent.trim() : !chat.inputValue.trim();

  return (
    <div className="p-4 border-t border-border">
      <div className="flex gap-2">
        {/* Peer groups only: a node-backed channel's server has no file path. */}
        {peer && !editing && <GroupAttachButton groupId={groupId} />}
        <Textarea
          ref={composerRef}
          value={editing ? chat.editContent : chat.inputValue}
          onChange={(e) => (editing ? chat.setEditContent(e.target.value) : chat.setInputValue(e.target.value))}
          onKeyDown={onKeyDown}
          placeholder={placeholderFor(editing, sharingDoc, chat.messageType === 'Markdown')}
          data-testid="group-message-input"
          className="flex-1 resize-none bg-background focus:border-primary-accent"
          rows={1}
        />
        <Button
          aria-label={editing ? 'Save edit' : sharingDoc ? 'Share live document' : 'Send message'}
          onClick={send}
          disabled={busy || (empty && !sharingDoc)}
          className="bg-primary hover:bg-primary/90"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      {!editing && (
        <TypeSelectorBar
          types={peer ? GROUP_COMPOSE_TYPES : NODE_CHAT_COMPOSE_TYPES}
          selectedType={liveDoc ? 'live_document' : toComposeType(chat.messageType)}
          onTypeChange={(type: MessageType) => {
            setLiveDoc(type === 'live_document');
            if (type !== 'live_document') chat.setMessageType(toMemberType(type));
          }}
        />
      )}
    </div>
  );
}
