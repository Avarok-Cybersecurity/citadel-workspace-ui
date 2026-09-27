/** What a group message says, by its type: a shared file, a live document, Markdown or text. */
import React from 'react';
import type { GroupMessage } from '@/types/workspace-entities';
import { GroupFileShareCard } from './GroupFileShareCard';
import { RenderedMarkdown } from './shared/RenderedMarkdown';
import { GroupLiveDocCard, type OpenLiveDoc } from './live-doc/GroupLiveDocCard';

export function GroupMessageBody({ message, onOpenDocument }: { message: GroupMessage; onOpenDocument: (doc: OpenLiveDoc) => void }): JSX.Element {
  if (message.file_share) return <GroupFileShareCard share={message.file_share} senderName={message.sender_name} />;
  if (message.message_type === 'LiveDocument' && message.document_id) {
    return <GroupLiveDocCard doc={{ id: message.document_id, title: message.document_title ?? 'Untitled document' }} onOpen={onOpenDocument} />;
  }
  if (message.message_type === 'Markdown') {
    return <div className="break-words" data-testid="group-message-markdown"><RenderedMarkdown content={message.content} /></div>;
  }
  return <p className="whitespace-pre-wrap break-words">{message.content}</p>;
}
